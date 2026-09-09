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
