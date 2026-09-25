import { describe, it, expect } from "vitest";
import { parseIsbnInput } from "./identity";

describe("parseIsbnInput — a lookup refuses what it cannot trust", () => {
  it.each([
    ["978-0-13-468599-1", "isbn13"],
    ["9780134685991", "isbn13"],
    [" 978 0 13 468599 1 ", "isbn13"],
    ["0-13-468599-7", "isbn10"],
    ["0134685997", "isbn10"],
  ])("%s → the same canonical ISBN-13", (raw, kind) => {
    expect(parseIsbnInput(raw)).toEqual({ ok: true, isbn13: "9780134685991", isbn10: "0134685997", inputKind: kind });
  });

  it("reads Khmer digits", () => {
    expect(parseIsbnInput("៩៧៨០១៣៤៦៨៥៩៩១")).toMatchObject({ ok: true, isbn13: "9780134685991" });
  });

  it("keeps an X check character in the ISBN-10", () => {
    const r = parseIsbnInput("0-8044-2957-X");
    expect(r).toMatchObject({ ok: true, isbn10: "080442957X", inputKind: "isbn10" });
  });

  it("a 979 ISBN-13 has no ISBN-10", () => {
    expect(parseIsbnInput("979-10-90636-07-1")).toMatchObject({ ok: true, isbn13: "9791090636071", isbn10: null });
  });

  it("never silently corrects a bad check digit", () => {
    expect(parseIsbnInput("978-0-13-468599-2")).toEqual({ ok: false, reason: "bad_check_digit" });
    expect(parseIsbnInput("0134685998")).toEqual({ ok: false, reason: "bad_check_digit" });
  });

  it.each(["", "   ", "N/A"])("%j is empty", (raw) => expect(parseIsbnInput(raw)).toEqual({ ok: false, reason: "empty" }));
  it.each(["12345", "978013468599", "hello world"])("%j is not an ISBN", (raw) =>
    expect(parseIsbnInput(raw)).toEqual({ ok: false, reason: "not_an_isbn" }));
});
