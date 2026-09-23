// lib/db/paginated-sweep.test.ts
//
// A SOURCE SCAN, like the other invariant tests in this repo. It fails on the
// code it scans, not on a function it calls.
//
// THE RULE: a `.range()` loop that sweeps a table to completion must carry an
// `.order()` on a UNIQUE key.
//
// A sweep is a sequence of independent LIMIT/OFFSET queries. Postgres makes no
// promise that two of them agree on row order, so without an ORDER BY a row
// can be returned by two pages (counted twice) or by none (dropped silently).
// Nothing errors; the sweep just answers a different question every time.
//
// Measured against production `book_chunks` (132,270 rows) before this rule:
//
//   unordered sweep  fetched 132,270 rows · 90,335 DISTINCT · 41,935 duplicates
//                    29,691 rows returned by one sweep were absent from the next
//   ordered sweep    fetched 132,270 rows · 132,270 DISTINCT · 0 duplicates
//
// The victim was scripts/audit-resource-health.ts, the report that decides
// which resources get reprocessed. Books whose chunks all landed in a skipped
// window read as `not_embedded`, so it answered 231 / 230 / 234 ai_ready on
// three consecutive runs against a database that was not changing — and named
// 17-23 healthy books as needing a backfill. Ordered, it answers 245 every
// time, with 6 genuinely actionable.
//
// Scoped to the files that sweep to completion. A single bounded `.range()`
// serving one page of a UI listing is a different question (it also wants a
// stable order, but its failure is a shuffled page, not lost data).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POSTGREST_MAX_ROWS } from "./paged-scan";

const ROOT = join(__dirname, "..", "..");

/** Files whose `.range()` calls page through a whole table. */
const SWEEP_FILES = [
  "app/sitemap.ts",
  "lib/chunk-embed.ts",
  "lib/oai/records.ts",
  "lib/metadata-exports/works.ts",
  "scripts/audit-resource-health.ts",
  "scripts/embed-library.ts",
  "scripts/extract-pdf-text.ts",
  "scripts/build-semantic-insights.ts",
  "scripts/repair-truncated-titles.ts",
  // The public entity layer. Every one of these read its tables in ONE
  // request until 2026-09-23, which PostgREST clipped at 1000 rows without
  // erroring — see PUBLIC_LOADERS below for what that published.
  "lib/subjects/index.ts",
  "lib/authors/directory.ts",
  "lib/authors/profile.ts",
  "lib/authors/canonical-works.ts",
  "lib/home-data.ts",
  "lib/indexing/reconcile.ts",
];

/**
 * The statement chain ending at each `.range(`: walk back to the `.from(` that
 * opened it. Returns one string per `.range()` call site.
 */
function rangeChains(src: string): { chain: string; line: number }[] {
  const out: { chain: string; line: number }[] = [];
  let idx = src.indexOf(".range(");
  while (idx !== -1) {
    const start = src.lastIndexOf(".from(", idx);
    if (start !== -1) {
      out.push({
        chain: src.slice(start, idx),
        line: src.slice(0, idx).split("\n").length,
      });
    }
    idx = src.indexOf(".range(", idx + 1);
  }
  return out;
}

/**
 * Terminal ordering keys accepted as UNIQUE, and why.
 *
 * "Carries an `.order()`" was the rule this file asserted for its first year;
 * "orders on a UNIQUE key" was the rule it DOCUMENTED. The gap is not
 * academic — `app/sitemap.ts` ordered all seven of its sweeps on `created_at`,
 * passed this test every time, and dropped five published books from
 * production's sitemap.xml between two revalidations of an unchanged
 * collection (measured 2026-09-16; see the comment above `TIEBREAK` there).
 * A tie is exactly where a sweep loses rows, so the LAST ordering term is the
 * only one that decides whether the sweep is deterministic.
 *
 * `requiresFilters` is for a key that is unique only within the scope the
 * query already pins: `book_pages` is unique on
 * (record_type, record_id, page_no), so a sweep that fixes the first two with
 * `.eq()` and orders by the third has a total order. Without those filters the
 * same key is ambiguous across the table.
 */
const UNIQUE_TERMINAL_KEYS: {
  key: string;
  requiresFilters?: string[];
  requiresOrder?: string[];
  why: string;
}[] = [
  { key: "id", why: "primary key — unique by definition" },
  { key: "slug", why: "unique per resource table; it is also the URL key" },
  {
    key: "page_no",
    requiresFilters: ["record_type", "record_id"],
    why: "book_pages is unique on (record_type, record_id, page_no)",
  },
  // Two tables in the public read path have a COMPOSITE primary key and no
  // `id` column at all, so the only total order they have is the whole key.
  // `requiresOrder` is the composite-key counterpart of `requiresFilters`: the
  // earlier term is not pinned by a filter, it is the rest of the sort.
  {
    key: "record_id",
    requiresOrder: ["record_type"],
    why: "resource_index_state is keyed on (record_type, record_id) — it has no id column",
  },
  {
    key: "author_id",
    requiresOrder: ["publication_id"],
    why: "publication_authorships is keyed on (publication_id, author_id) — it has no id column",
  },
];

/**
 * Sweeps whose ordering is chosen at runtime rather than written literally.
 * Each must be covered by an assertion of its own, named here so this list
 * cannot become a silent exemption.
 */
const DYNAMIC_ORDERING = new Map<string, string>([
  [
    "scripts/audit-resource-health.ts",
    'covered below by "audit-resource-health requires an explicit ordering per table"',
  ],
]);

/** `.order("x")` / `.order(CONST)` terms of a chain, in source order. */
function orderTerms(chain: string, src: string): (string | null)[] {
  const terms: (string | null)[] = [];
  for (const m of chain.matchAll(/\.order\(\s*([^,)]+)/g)) {
    const raw = m[1].trim();
    const literal = raw.match(/^["'`]([^"'`]+)["'`]$/);
    if (literal) {
      terms.push(literal[1]);
      continue;
    }
    // A bare identifier: resolve it only when the file declares it as a
    // string literal (`const TIEBREAK = 'id'`). Anything else is dynamic.
    const decl = src.match(
      new RegExp(`\\bconst\\s+${raw.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`),
    );
    terms.push(decl ? decl[1] : null);
  }
  return terms;
}

describe("paginated sweeps end on a unique key", () => {
  it.each(SWEEP_FILES.filter((f) => !DYNAMIC_ORDERING.has(f)))(
    "%s breaks every tie",
    (rel) => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const offenders: string[] = [];

      for (const { chain, line } of rangeChains(src)) {
        const terms = orderTerms(chain, src);
        const last = terms[terms.length - 1];
        if (last === undefined) {
          offenders.push(`${rel}:${line} sweeps with no .order()`);
          continue;
        }
        if (last === null) {
          offenders.push(
            `${rel}:${line} orders by a runtime value — add the file to DYNAMIC_ORDERING with its own assertion`,
          );
          continue;
        }
        const rule = UNIQUE_TERMINAL_KEYS.find((u) => u.key === last);
        if (!rule) {
          offenders.push(
            `${rel}:${line} ends its ORDER BY on "${last}", which is not declared unique — ` +
              "a tie there lets a row be fetched twice or not at all",
          );
          continue;
        }
        const missing = (rule.requiresFilters ?? []).filter(
          (col) => !new RegExp(`\\.eq\\(\\s*["'\`]${col}["'\`]`).test(chain),
        );
        if (missing.length > 0) {
          offenders.push(
            `${rel}:${line} orders by "${last}", unique only when ${missing.join(" + ")} is pinned by .eq()`,
          );
          continue;
        }
        const missingOrder = (rule.requiresOrder ?? []).filter(
          (col) => !terms.slice(0, -1).includes(col),
        );
        if (missingOrder.length > 0) {
          offenders.push(
            `${rel}:${line} orders by "${last}", unique only after ${missingOrder.join(" + ")} — ` +
              "order by the whole composite key",
          );
        }
      }

      expect(offenders).toEqual([]);
    },
  );

  it("names a reason for every sweep whose ordering is dynamic", () => {
    for (const [file, why] of DYNAMIC_ORDERING) {
      expect(SWEEP_FILES).toContain(file);
      expect(why.length).toBeGreaterThan(0);
    }
  });

  it("keeps the sitemap's tiebreaker on the primary key", () => {
    // The sitemap is the sweep this rule was written for, and the one whose
    // failure is invisible: the XML stays well-formed and the route still
    // answers 200 while an arbitrary handful of published books go missing.
    const src = readFileSync(join(ROOT, "app/sitemap.ts"), "utf8");
    expect(src).toMatch(/const TIEBREAK = ['"]id['"]/);
    // Every sweep in that file must actually use it.
    const chains = rangeChains(src);
    expect(chains.length).toBeGreaterThan(0);
    for (const { chain, line } of chains) {
      expect(`${line}:${chain.includes("TIEBREAK")}`).toBe(`${line}:true`);
    }
  });
});

describe("paginated sweeps are deterministic", () => {
  it.each(SWEEP_FILES)("%s orders every sweep", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const chains = rangeChains(src);
    expect(chains.length).toBeGreaterThan(0);

    const unordered = chains
      .filter(({ chain }) => !chain.includes(".order("))
      .map(({ line }) => `${rel}:${line}`);

    expect(unordered).toEqual([]);
  });

  it("audit-resource-health requires an explicit ordering per table", () => {
    const src = readFileSync(join(ROOT, "scripts/audit-resource-health.ts"), "utf8");
    // The helper must refuse an empty ordering rather than sweep unordered.
    expect(src).toMatch(/allRows needs a unique ordering/);
    // resource_index_state has no `id` column; it must order by its real key.
    expect(src).toMatch(/"resource_index_state"[\s\S]{0,120}\["record_type", "record_id"\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SECOND RULE: a public loader may not read a clippable table UNBOUNDED.
//
// The rule above watches sweeps that already page. It says nothing about the
// failure that produced them, which is a read that never looks like a sweep at
// all:
//
//   supabase.from("books").select("id, category_id").eq("is_published", true)
//
// PostgREST answers that with 1000 rows and no error, whatever the collection
// holds and whatever `.limit()` was attached — the cap is applied ON TOP of the
// request's own limit, so `.limit(5000)` and `.limit(10000)` were decoration.
// Measured against production on 2026-09-23, over 1,956 published books
// (SEO corpus audit, 2026-09-23, F-S1, F-A1):
//
//   the 34 subject pages' e-book counts summed to exactly 1,000, against 1,955
//     subject assignments — Mathematics showed 153 and holds 440
//   four subject hubs sat at `noindex` and one was dropped from the hub, on
//     counts that clear the depth gate when the whole table is read
//   the author directory credited the Ministry of Education with 652 works of
//     1,037, and its own page stopped at "1000 works shown"
//   223 author pages answered `200 index, follow` while absent from the
//     sitemap, from /authors and from their own books' bylines
//   435 books (22%) printed a byline that linked nowhere
//   the homepage's "Browse by Subject" tiles read "Science 256 items"
//     against 749 books
//
// None of it errored, and every number was rendered as a fact.

/**
 * Tables production already holds more than POSTGREST_MAX_ROWS rows of.
 *
 * Membership is a MEASURED claim, not a guess about the future: each of these
 * was over the cap on 2026-09-23. A table added here that is actually small
 * costs one paged call; a table left out that is actually large costs a silent
 * wrong answer, so the list errs toward inclusion.
 */
const CLIPPABLE_TABLES = [
  "books",
  "book_files",
  "book_pages",
  "book_chunks",
  "resource_contributors",
  "resource_index_state",
];

/** Files whose reads decide what the public site publishes. */
const PUBLIC_LOADERS = [
  "lib/subjects/index.ts",
  "lib/authors/directory.ts",
  "lib/authors/profile.ts",
  "lib/authors/canonical-works.ts",
  "lib/home-data.ts",
  "lib/indexing/reconcile.ts",
];

/**
 * The builder chain starting at `.from(` — up to the `;` or `,` that closes
 * it, or the `)` of whatever call encloses it.
 *
 * Brackets are tracked so a comma inside `.select("id, author_id")` or
 * `.range(from, to)` does not end it, and comments are skipped so prose does
 * not either: the first draft of this scan ended the `getRecentlyAddedCached`
 * chain at the comma in "// ... (created_at), not its publication year" and
 * reported a correctly bounded query as unbounded.
 */
function chainFrom(src: string, idx: number): string {
  let depth = 0;
  let out = "";
  let i = idx;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      out += ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        const done = src[i] === ch;
        i++;
        if (done) break;
      }
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) return out;
      depth--;
    } else if (depth === 0 && (ch === ";" || ch === ",")) return out;
    out += ch;
    i++;
  }
  return out;
}

/**
 * The `.limit()` argument as a number, or null when it cannot be read here.
 *
 * Null means UNKNOWN and is treated as bounded: a limit computed from a
 * function parameter is a decision this scan cannot audit, and guessing would
 * make the rule fire on correct code. What it must catch is the limit that is
 * written down and is above the server's cap — the one that reads as a bound
 * and is not one.
 */
function limitValue(chain: string, src: string): number | null {
  const m = chain.match(/\.limit\(\s*([^)]+)\)/);
  if (!m) return null;
  const raw = m[1].trim();
  const arithmetic = raw.match(/^([A-Za-z_$][\w$]*)\s*\*\s*(\d+)$/);
  const name = arithmetic ? arithmetic[1] : raw;
  const factor = arithmetic ? Number(arithmetic[2]) : 1;
  if (/^\d+$/.test(name)) return Number(name) * factor;
  const decl = src.match(
    new RegExp(`\\bconst\\s+${name.replace(/[.*+?^$()|[\\]\\\\]/g, "\\\\$&")}\\s*=\\s*([\\d_]+)\\s*;`),
  );
  if (!decl) return null;
  return Number(decl[1].replace(/_/g, "")) * factor;
}

describe("public loaders never read a clippable table unbounded", () => {
  it.each(PUBLIC_LOADERS)("%s bounds every read of a large table", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const offenders: string[] = [];

    for (const table of CLIPPABLE_TABLES) {
      const needle = `.from("${table}")`;
      let idx = src.indexOf(needle);
      while (idx !== -1) {
        const chain = chainFrom(src, idx);
        const line = src.slice(0, idx).split("\n").length;

        // Paged — the first rule above then checks that it orders on a unique key.
        const paged = chain.includes(".range(");
        // At most one row by construction.
        const singular =
          /\.maybeSingle\(|\.single\(/.test(chain) ||
          /\.eq\(\s*["'`](id|slug)["'`]/.test(chain);
        // A named set. Clippable in its own right, which is why the file must
        // also be splitting the ids — see chunked() in lib/db/paged-scan.ts.
        const batched = chain.includes(".in(") && src.includes("chunked");
        // A head count is not a row scan and is never clipped.
        const counting = /head:\s*true/.test(chain);
        const limit = limitValue(chain, src);

        if (!paged && !singular && !batched && !counting) {
          if (limit === null && !/\.limit\(/.test(chain)) {
            offenders.push(
              `${rel}:${line} reads ${table} with no bound — PostgREST will answer with its first ` +
                `${POSTGREST_MAX_ROWS} rows and no error`,
            );
          } else if (limit !== null && limit > POSTGREST_MAX_ROWS) {
            offenders.push(
              `${rel}:${line} reads ${table} with .limit(${limit}), which is above the server's ` +
                `${POSTGREST_MAX_ROWS}-row cap and is therefore not a bound — page it instead`,
            );
          }
        }
        idx = src.indexOf(needle, idx + 1);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("checks files that actually read one of these tables", () => {
    // A scan that matches nothing passes silently, which is how an invariant
    // stops being one. Every listed loader must contain at least one read the
    // rule above had to judge.
    for (const rel of PUBLIC_LOADERS) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const reads = CLIPPABLE_TABLES.filter((t) => src.includes(`.from("${t}")`));
      expect(`${rel}: ${reads.length > 0}`).toBe(`${rel}: true`);
    }
  });

  it("routes every public loader's paging through lib/db/paged-scan", () => {
    for (const rel of PUBLIC_LOADERS) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      if (!src.includes(".range(")) continue;
      expect(`${rel}: ${src.includes("@/lib/db/paged-scan")}`).toBe(`${rel}: true`);
    }
  });
});
