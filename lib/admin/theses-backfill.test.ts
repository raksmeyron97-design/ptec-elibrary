import { describe, it, expect } from "vitest";
import {
  applyBackfillFilter,
  BACKFILL_OPTIONS,
  BACKFILL_TOP_N,
  summarizeBackfill,
  type BackfillRow,
} from "@/lib/admin/theses-shared";

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

describe("summarizeBackfill — the coverage count beside the worklist", () => {
  const row = (over: Partial<BackfillRow>): BackfillRow => ({
    language: "en",
    title_km: null,
    abstract_km: null,
    table_of_contents: null,
    ...over,
  });

  it("counts each field over the theses that owe it", () => {
    expect(
      summarizeBackfill([
        row({ title_km: "ក", abstract_km: "ខ", table_of_contents: [] }),
        row({ title_km: "ក" }),
        row({ language: "km", table_of_contents: [{ level: 1, label: "x" }] }),
        row({ language: null, abstract_km: "ខ" }),
      ]),
    ).toEqual({ considered: 4, khmerApplicable: 3, titleKm: 2, abstractKm: 2, contents: 2, complete: 2 });
  });

  it("never owes a Khmer-language thesis a Khmer title — as the worklist filter does not", () => {
    const km = summarizeBackfill([row({ language: "km", table_of_contents: [] })]);
    expect(km).toMatchObject({ khmerApplicable: 0, complete: 1 });
    const { calls } = (() => {
      const calls: string[] = [];
      const q = {
        or(f: string) {
          calls.push(f);
          return q;
        },
        is() {
          return q;
        },
      };
      applyBackfillFilter(q, "khmer");
      return { calls };
    })();
    // The filter's candidate set is the same three languages.
    expect(calls[0]).toBe("language.is.null,language.in.(en,km_en)");
  });

  it("an empty collection is zero of zero, not an error", () => {
    expect(summarizeBackfill([])).toEqual({ considered: 0, khmerApplicable: 0, titleKm: 0, abstractKm: 0, contents: 0, complete: 0 });
    expect(BACKFILL_TOP_N).toBe(50);
  });
});
