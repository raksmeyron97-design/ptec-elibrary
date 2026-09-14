import { describe, expect, it } from "vitest";
import { authorFilterKey } from "./filter-key";

describe("authorFilterKey", () => {
  it("matches regardless of case and Latin accents", () => {
    expect(authorFilterKey("Elena Rodríguez")).toBe("elena rodriguez");
    expect(authorFilterKey("elena rodriguez").includes(authorFilterKey("RODRÍGUEZ"))).toBe(true);
  });

  it("keeps Khmer intact — its vowel signs and subscripts are letters here", () => {
    const km = "ក្រសួងអប់រំ យុវជន និងកីឡា";
    expect(authorFilterKey(km)).toBe(km);
    expect(authorFilterKey(km).includes(authorFilterKey("អប់រំ"))).toBe(true);
  });

  it("joins both forms of a name so either one finds the row", () => {
    const key = authorFilterKey("Pich Chanthou", "ពេជ្រ ចន្ធូ");
    expect(key.includes("pich")).toBe(true);
    expect(key.includes("ពេជ្រ")).toBe(true);
  });

  it("ignores missing parts and collapses whitespace", () => {
    expect(authorFilterKey("  Sok   Dara ", null, undefined)).toBe("sok dara");
  });
});
