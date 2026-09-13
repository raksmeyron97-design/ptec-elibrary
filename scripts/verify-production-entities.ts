// scripts/verify-production-entities.ts
//
//   npx tsx scripts/verify-production-entities.ts
//   npx tsx scripts/verify-production-entities.ts --base https://library.ptec.edu.kh
//   npx tsx scripts/verify-production-entities.ts --json reports/seo/entity-smoke.json
//
// READ-ONLY. Fetches public pages over HTTP and asserts what their JSON-LD
// claims about contributor ENTITIES. It writes nothing anywhere but the
// optional --json path, and never touches a database.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// SEO 3.2 shipped a regression that every other check passed. A diff of all
// 296 book pages proved the canonical contributor output byte-identical to
// production — and was then treated as evidence the whole merge was safe. It
// was not: author pages are a DIFFERENT code path that the same change
// touched, and they shipped two defects (a second institution node, and a
// three-editor byline published as one Person's name).
//
// The lesson is not "test harder". It is that a parity proof covers the routes
// it covered, and a route nobody enumerated is a route nobody checked. So this
// enumerates them, by ENTITY SHAPE rather than by URL: one fixture per way a
// contributor can be wrong, across every public route family that renders one.
//
// The fixtures are real production records, chosen because each is the ONLY
// example of its shape in the collection, and the assertions are about entity
// TYPE and identity — never about a title or a name that a cataloguer may
// legitimately edit.

/* eslint-disable @typescript-eslint/no-explicit-any */

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const JSON_OUT = flag("json");

type Check = {
  /** What entity shape this fixture is the example of. */
  shape: string;
  path: string;
  /** Which JSON-LD node to read, and which property carries the contributors. */
  node: string;
  property: "author" | "mainEntity";
  expect: (value: unknown) => string | null;
};

// ── Assertions ───────────────────────────────────────────────────────────────

const ORGANIZATION_NODE_ID = `${BASE}/#organization`;

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** A bare `@id` reference — the institution, never a second node. */
function isInstitutionRef(v: any): boolean {
  return !!v && typeof v === "object" && "@id" in v && !("@type" in v) && v["@id"] === ORGANIZATION_NODE_ID;
}

const expectInstitutionRef = (value: unknown): string | null => {
  const nodes = asArray(value);
  if (nodes.length !== 1) return `expected exactly 1 node, got ${nodes.length}`;
  if (!isInstitutionRef(nodes[0])) {
    return `expected a bare @id reference to ${ORGANIZATION_NODE_ID}, got ${JSON.stringify(nodes[0])}`;
  }
  return null;
};

const expectTypes = (...types: string[]) => (value: unknown): string | null => {
  const nodes = asArray(value);
  if (nodes.length !== types.length) {
    return `expected ${types.length} node(s), got ${nodes.length}: ${JSON.stringify(value)}`;
  }
  for (const [i, want] of types.entries()) {
    const got = nodes[i]?.["@type"];
    if (got !== want) return `node ${i}: expected ${want}, got ${got ?? JSON.stringify(nodes[i])}`;
  }
  return null;
};

/** No identity at all — the honest answer for a URL naming several entities. */
const expectNoIdentity = (value: unknown): string | null =>
  value === undefined || value === null || asArray(value).length === 0
    ? null
    : `expected NO identity to be asserted, got ${JSON.stringify(value)}`;

/** A single Person whose name is one person's, not a whole byline. */
const expectSinglePerson = (value: unknown): string | null => {
  const err = expectTypes("Person")(value);
  if (err) return err;
  const name = String(asArray(value)[0]?.name ?? "");
  // A name carrying a list delimiter or a role marker is a byline, not a name.
  if (/,|;|\band\b|\(Editors?\)|\(Trans/i.test(name)) {
    return `a single Person is carrying a whole byline: ${JSON.stringify(name)}`;
  }
  return null;
};

// ── Fixtures — one per entity shape, per route family ────────────────────────

const CHECKS: Check[] = [
  // Resource pages
  { shape: "book · person", path: "/books/practical-research-methods", node: "Book", property: "author", expect: expectTypes("Person") },
  { shape: "book · several people", path: "/books/effective-school-management-4th-edition", node: "Book", property: "author", expect: expectTypes("Person", "Person", "Person") },
  { shape: "book · editor role marker", path: "/books/competency-based-language-teaching-in-higher-education", node: "Book", property: "author", expect: expectSinglePerson },
  { shape: "book · organization", path: "/books/moeys-capacity-development-platform", node: "Book", property: "author", expect: expectTypes("Organization") },
  { shape: "book · the institution", path: "/books/action-research-series-volume-1", node: "Book", property: "author", expect: expectInstitutionRef },
  { shape: "book · Khmer, several people", path: "/books/រដ្ឋបាលសាធារណៈ", node: "Book", property: "author", expect: expectTypes("Person", "Person", "Person", "Person", "Person", "Person") },

  // Author pages — the route family the book parity proof did not cover.
  { shape: "author · person", path: "/authors/adrian-wallwork", node: "ProfilePage", property: "mainEntity", expect: expectSinglePerson },
  { shape: "author · organization", path: "/authors/ministry-of-education-youth-and-sport", node: "ProfilePage", property: "mainEntity", expect: expectTypes("Organization") },
  { shape: "author · THE INSTITUTION", path: "/authors/phnom-penh-teacher-education-college", node: "ProfilePage", property: "mainEntity", expect: expectInstitutionRef },
  { shape: "author · composite (several people, one URL)", path: "/authors/bert-p-m-creemers-leonidas-kyriakides-pam-sammons-editors", node: "ProfilePage", property: "mainEntity", expect: expectNoIdentity },
];

// ── Runner ───────────────────────────────────────────────────────────────────

function jsonLdNodes(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* a malformed block is reported by the caller as a missing node */
    }
  }
  return out;
}

async function run() {
  console.log(`\nEntity smoke test — ${BASE}\n`);
  const results: any[] = [];
  let failed = 0;

  for (const check of CHECKS) {
    const url = `${BASE}${encodeURI(check.path)}`;
    let status = 0;
    let error: string | null = null;
    let actual: unknown;

    try {
      const res = await fetch(url, { redirect: "follow" });
      status = res.status;
      if (!res.ok) {
        error = `HTTP ${status}`;
      } else {
        const html = await res.text();
        const node = jsonLdNodes(html).find((d) => d?.["@type"] === check.node);
        if (!node) error = `no ${check.node} JSON-LD on the page`;
        else {
          actual = node[check.property];
          error = check.expect(actual);
        }
      }
    } catch (err) {
      error = `request failed: ${(err as Error).message}`;
    }

    if (error) failed++;
    results.push({ shape: check.shape, path: check.path, status, ok: !error, error, actual });
    console.log(`  ${error ? "FAIL" : "ok  "}  ${check.shape.padEnd(44)} ${check.path}`);
    if (error) console.log(`        ${error}`);
  }

  console.log(`\n${CHECKS.length - failed}/${CHECKS.length} passed\n`);

  if (JSON_OUT) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), failed, results }, null, 2)}\n`,
    );
    console.log(`Wrote ${JSON_OUT}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

run();
