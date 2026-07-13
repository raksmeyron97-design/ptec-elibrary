import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("neutralises formula-injection triggers", () => {
    expect(escapeCsvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("-2")).toBe("'-2");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
  });

  it("quotes cells containing separators and quotes", () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("passes plain values and empties through", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("keeps Khmer text unchanged", () => {
    expect(escapeCsvCell("ស្រាវជ្រាវ")).toBe("ស្រាវជ្រាវ");
  });
});

describe("toCsv", () => {
  it("builds a BOM-prefixed CRLF file with escaped cells", () => {
    const rows = [
      { title: "=evil", n: 3 },
      { title: "ok, fine", n: 0 },
    ];
    const csv = toCsv(rows, [
      { key: "title", header: "Title", value: (r) => r.title },
      { key: "n", header: "Views", value: (r) => r.n },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Title,Views");
    expect(lines[1]).toBe("'=evil,3");
    expect(lines[2]).toBe('"ok, fine",0');
  });
});
