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
const UNIQUE_TERMINAL_KEYS: { key: string; requiresFilters?: string[]; why: string }[] = [
  { key: "id", why: "primary key — unique by definition" },
  { key: "slug", why: "unique per resource table; it is also the URL key" },
  {
    key: "page_no",
    requiresFilters: ["record_type", "record_id"],
    why: "book_pages is unique on (record_type, record_id, page_no)",
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
