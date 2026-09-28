import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POSTGREST_OR_BUDGET, clausesWithinBudget } from "./postgrest-url";

const encodedOr = (clauses: string[]) => encodeURIComponent(`(${clauses.join(",")})`).length;

describe("an .or() filter built from a reader's words stays inside the URL budget", () => {
  it("keeps everything that fits, in order", () => {
    expect(clausesWithinBudget(["title.ilike.%a%", "author.ilike.%a%"])).toEqual(["title.ilike.%a%", "author.ilike.%a%"]);
  });

  it("a 53-letter Khmer title over ten columns — the query that returned 414 — fits, most valuable first", () => {
    const title = "សៀវភៅណែនាំស្តីពីឧបករណ៍ពិសោធ មន្ទីពិសោធន៍វិទ្យាសាស្រ្ត";
    const fields = ["title", "author", "ddc", "isbn", "accession_number", "category", "department", "publisher", "shelf_location", "description"];
    const all = fields.flatMap((f) => [title, ...title.split(" ")].map((w) => `${f}.ilike.%${w}%`));
    expect(encodedOr(all)).toBeGreaterThan(8_000); // what used to be sent
    const kept = clausesWithinBudget(all);
    expect(encodedOr(kept)).toBeLessThanOrEqual(POSTGREST_OR_BUDGET);
    expect(kept[0]).toBe(all[0]); // title, whole query
    expect(kept.length).toBeGreaterThan(0);
  });

  it("skips a clause too long to fit but still keeps a later, shorter one", () => {
    const huge = `title.ilike.%${"ក".repeat(2_000)}%`;
    expect(clausesWithinBudget([huge, "author.ilike.%x%"])).toEqual(["author.ilike.%x%"]);
  });

  it("leaves room under Kong's 8 KB request line for the rest of the URL", () => {
    expect(POSTGREST_OR_BUDGET).toBeLessThanOrEqual(6_500);
  });

  it("is used wherever search builds an .or() from a reader's words", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    expect(read("lib/search/native-search.ts")).toMatch(/clausesWithinBudget\(/);
    expect(read("lib/catalogs/search-scope.ts")).toMatch(/clausesWithinBudget\(/);
  });
});
