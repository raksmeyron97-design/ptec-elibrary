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

import {
  errorOutcome,
  exitCodeFor,
  fetchWithRetry,
  incompleteBanner,
  summaryLine,
  tally,
  type Outcome,
} from "../lib/verify/http";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const JSON_OUT = flag("json");
/** Treat a missing fixture as a failure too. For a one-off manual audit. */
const STRICT = argv.includes("--strict");

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

// ── Outcomes: a wrong entity is not the same event as a moved record ─────────
//
// This runs unattended on every deploy, so what it does with an unexpected
// result decides whether anyone still reads it in six months. The repository
// already learned this twice — `docs/ALERT-CATALOG.md` hygiene rule 2, and the
// AI live-monitoring contract in CLAUDE.md: "a job that goes red for wording
// drift stops being read, and the hard gates stop being read with it."
//
// The fixtures are ten real production records, each the only example of its
// entity shape. A librarian unpublishing one is ordinary cataloguing, and it
// must not page anybody. A Person appearing where an Organization belongs is
// the regression this exists to catch.
//
//   404 / 410              → WARN   the record moved. Data, not code.
//   200, structured data   → FAIL   the page renders but lost its JSON-LD.
//     node missing
//   200, wrong entity      → FAIL   the regression itself.
//   5xx, timeout, other    → FAIL   the deploy is broken; that is worth waking
//                                   someone for even though it is not an
//                                   entity defect.
//
// One escalation: if MOST fixtures warn, the collection did not quietly drift
// — something systemic happened (a bad sitemap, a routing change, the wrong
// host) and a pile of warnings would hide it. See SYSTEMIC_WARN_RATIO.

/** Above this share of warnings, the warnings themselves are the finding. */
const SYSTEMIC_WARN_RATIO = 0.5;

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
  console.log(`\nEntity smoke test — ${BASE}${STRICT ? " (strict)" : ""}\n`);
  const results: any[] = [];

  for (const check of CHECKS) {
    const url = `${BASE}${encodeURI(check.path)}`;
    let outcome: Outcome = "ok";
    let status = 0;
    let detail: string | null = null;
    let actual: unknown;

    try {
      // 404/410 are answers this check interprets itself (a moved fixture),
      // so they are allowed through rather than thrown as errors.
      const res = await fetchWithRetry(url, { allowStatuses: [404, 410] });
      status = res.status;

      if (status === 404 || status === 410) {
        outcome = "warn";
        detail = `HTTP ${status} — the fixture record is gone or unpublished`;
      } else if (!res.ok) {
        outcome = "fail";
        detail = `HTTP ${status}`;
      } else {
        const html = await res.text();
        const node = jsonLdNodes(html).find((d) => d?.["@type"] === check.node);
        if (!node) {
          outcome = "fail";
          detail = `the page rendered but carries no ${check.node} JSON-LD`;
        } else {
          actual = node[check.property];
          detail = check.expect(actual);
          if (detail) outcome = "fail";
        }
      }
    } catch (err) {
      // A socket reset says nothing about this page's JSON-LD. Recording it as
      // a defect is what made a clean site report a failure on 2026-09-13.
      [outcome, detail] = errorOutcome(err);
    }

    results.push({ shape: check.shape, path: check.path, status, outcome, detail, actual });
    const label =
      outcome === "ok" ? "ok  " : outcome === "warn" ? "WARN" : outcome === "unknown" ? "????" : "FAIL";
    console.log(`  ${label}  ${check.shape.padEnd(44)} ${check.path}`);
    if (detail) console.log(`        ${detail}`);
  }

  const t = tally(results.map((r) => r.outcome));
  const systemic = t.warn > 0 && t.warn / results.length > SYSTEMIC_WARN_RATIO;

  // NOT `length - failed - warned`: an unanswered fixture is not a pass.
  console.log(`\n${summaryLine(t)} (${results.length} fixtures)`);

  const banner = incompleteBanner(t);
  if (banner) console.log(`\n${banner}`);

  if (systemic) {
    console.log(
      `\n${t.warn} of ${results.length} fixtures are missing. That is not ` +
        "cataloguing drift — check the host, the sitemap and the routing before " +
        "editing fixtures.",
    );
  }

  if (JSON_OUT) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          base: BASE,
          generatedAt: new Date().toISOString(),
          ...t,
          incomplete: t.unknown > 0,
          systemic,
          results,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Wrote ${JSON_OUT}`);
  }
  console.log();

  // A systemic warn (most fixtures missing) still fails: that is the origin
  // answering consistently, not failing to answer.
  const bad = exitCodeFor(t, STRICT) !== 0 || systemic;
  process.exit(bad ? 1 : 0);
}

run();

export {};
