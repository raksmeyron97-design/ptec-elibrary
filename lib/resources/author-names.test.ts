import { describe, it, expect } from "vitest";
import { parseAuthorNames } from "./author-names";

describe("parseAuthorNames (mirrors 0105 SQL split)", () => {
  it("returns [] for empty / null / whitespace", () => {
    expect(parseAuthorNames(null)).toEqual([]);
    expect(parseAuthorNames(undefined)).toEqual([]);
    expect(parseAuthorNames("")).toEqual([]);
    expect(parseAuthorNames("   ")).toEqual([]);
  });

  it("keeps a single author intact", () => {
    expect(parseAuthorNames("Sokha Chan")).toEqual(["Sokha Chan"]);
  });

  it("splits on comma, semicolon, slash and ampersand", () => {
    expect(parseAuthorNames("A, B; C / D & E")).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("splits on the spelled-out ' and '", () => {
    expect(parseAuthorNames("Dara Kim and Sophea Lim")).toEqual(["Dara Kim", "Sophea Lim"]);
  });

  it("handles the mixed 'A, B and C' pattern", () => {
    expect(parseAuthorNames("A, B and C")).toEqual(["A", "B", "C"]);
  });

  it("trims surrounding whitespace and drops empties from trailing delimiters", () => {
    expect(parseAuthorNames("  A ,  , B  ")).toEqual(["A", "B"]);
  });

  it("preserves order", () => {
    expect(parseAuthorNames("Third; First; Second")).toEqual(["Third", "First", "Second"]);
  });

  it("does NOT split names containing 'and' without spaces (case-sensitive, boundary-safe)", () => {
    // "Chandara" must not become "Ch" + "ara"; "Andy" must survive.
    expect(parseAuthorNames("Chandara Ny")).toEqual(["Chandara Ny"]);
    expect(parseAuthorNames("Andy Rael")).toEqual(["Andy Rael"]);
  });

  it("does not split uppercase AND (Postgres regex is case-sensitive)", () => {
    expect(parseAuthorNames("A AND B")).toEqual(["A AND B"]);
  });
});
