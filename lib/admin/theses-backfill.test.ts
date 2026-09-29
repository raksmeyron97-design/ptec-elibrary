import { describe, it, expect } from "vitest";
import { applyBackfillFilter, BACKFILL_OPTIONS } from "@/lib/admin/theses-shared";

/** Records the filter calls a PostgREST builder would receive. */
function recorder() {
  const calls: string[] = [];
  const q = {
    or(filters: string) {
      calls.push(`or=(${filters})`);
      return q;
    },
    is(column: string, value: null) {
      calls.push(`${column}=is.${value}`);
      return q;
    },
  };
  return { q, calls };
}

describe("applyBackfillFilter — the librarians' worklist (0160)", () => {
  it("contents: records with no table of contents", () => {
    const { q, calls } = recorder();
    applyBackfillFilter(q, "contents");
    expect(calls).toEqual(["table_of_contents=is.null"]);
  });

  it("khmer: asks only non-Khmer theses for a Khmer title or abstract", () => {
    const { q, calls } = recorder();
    applyBackfillFilter(q, "khmer");
    expect(calls).toEqual([
      "or=(language.is.null,language.in.(en,km_en))",
      "or=(title_km.is.null,abstract_km.is.null)",
    ]);
  });

  it("any: either gap, in one clause", () => {
    const { q, calls } = recorder();
    applyBackfillFilter(q, "any");
    expect(calls).toEqual([
      "or=(table_of_contents.is.null,and(or(language.is.null,language.in.(en,km_en)),or(title_km.is.null,abstract_km.is.null)))",
    ]);
  });

  it("filters nothing for an absent or unknown value", () => {
    for (const v of [undefined, "", "all", "bogus"]) {
      const { q, calls } = recorder();
      applyBackfillFilter(q, v);
      expect(calls).toEqual([]);
    }
  });

  it("covers every option the UI offers", () => {
    for (const option of BACKFILL_OPTIONS) {
      const { q, calls } = recorder();
      applyBackfillFilter(q, option);
      expect(calls.length, option).toBeGreaterThan(0);
    }
  });

  // The filter names 0160's columns; if the migration renamed one, every
  // queue would error rather than filter.
  it("names only columns migration 0160 adds, or ones research_reports already had", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/migrations/0160_thesis_bilingual_contents.sql", "utf8");
    for (const column of ["title_km", "abstract_km", "table_of_contents"]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
  });
});
