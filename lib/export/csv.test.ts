import { describe, expect, it } from "vitest";
import { escapeCsvCell, escapeCsvTextCell, sheetsToCsv, toCsv } from "./csv";
import { defineSheet } from "./core";

describe("escapeCsvCell", () => {
  it("neutralises formula-injection triggers in strings", () => {
    expect(escapeCsvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("-2")).toBe("'-2");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
    expect(escapeCsvCell("\tstart")).toBe("'\tstart");
  });

  it("keeps real numbers numeric — including negatives", () => {
    expect(escapeCsvCell(-2)).toBe("-2");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(3.5)).toBe("3.5");
    expect(escapeCsvCell(Number.NaN)).toBe("");
  });

  it("quotes cells containing separators, quotes, and edge whitespace", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvCell(" padded")).toBe('" padded"');
    expect(escapeCsvCell("padded ")).toBe('"padded "');
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

describe("escapeCsvTextCell", () => {
  it("wraps phone-like values so Excel keeps + and leading zeros", () => {
    expect(escapeCsvTextCell("+855 12 345 678")).toBe('"=""+855 12 345 678"""');
    expect(escapeCsvTextCell("012345678")).toBe('"=""012345678"""');
  });

  it("falls back to the standard guard for non-phone text", () => {
    expect(escapeCsvTextCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvTextCell("b7e9c9c2-1111-4222-8333-abcdefabcdef")).toBe(
      "b7e9c9c2-1111-4222-8333-abcdefabcdef",
    );
    expect(escapeCsvTextCell(null)).toBe("");
    expect(escapeCsvTextCell("")).toBe("");
  });
});

describe("toCsv", () => {
  it("builds a BOM-prefixed CRLF file with escaped cells", () => {
    const rows = [
      { title: "=evil", n: 3 },
      { title: "ok, fine", n: -4 },
    ];
    const csv = toCsv(rows, [
      { key: "title", header: "Title", value: (r) => r.title },
      { key: "n", header: "Views", value: (r) => r.n, kind: "number" },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Title,Views");
    expect(lines[1]).toBe("'=evil,3");
    expect(lines[2]).toBe('"ok, fine",-4');
    expect(lines[3]).toBe("");
  });

  it("routes text columns through the phone-preserving escape", () => {
    const csv = toCsv([{ phone: "+85512345678" }], [
      { key: "phone", header: "Phone", value: (r) => r.phone, kind: "text" },
    ]);
    expect(csv).toContain('"=""+85512345678"""');
  });

  it("keeps Khmer names intact next to the BOM", () => {
    const csv = toCsv([{ name: "សុខ ស៊ីម" }], [
      { key: "name", header: "Full Name", value: (r) => r.name },
    ]);
    expect(csv.slice(1).split("\r\n")[1]).toBe("សុខ ស៊ីម");
  });
});

describe("sheetsToCsv", () => {
  const usersSheet = defineSheet<{ name: string }>({
    name: "Users",
    rows: [{ name: "A" }],
    columns: [{ key: "name", header: "Name", value: (r) => r.name }],
  });
  const metricsSheet = defineSheet<{ m: string; v: number }>({
    name: "Summary",
    rows: [{ m: "Total", v: 9 }],
    columns: [
      { key: "m", header: "Metric", value: (r) => r.m },
      { key: "v", header: "Value", value: (r) => r.v, kind: "number" },
    ],
  });

  it("emits a plain table for a single sheet", () => {
    const csv = sheetsToCsv([usersSheet]);
    expect(csv).toBe("\uFEFFName\r\nA\r\n");
  });

  it("separates multiple sheets into named sections with one BOM", () => {
    const csv = sheetsToCsv([metricsSheet, usersSheet]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1)).toBe("Summary\r\nMetric,Value\r\nTotal,9\r\n\r\nUsers\r\nName\r\nA\r\n");
  });

  it("skips xlsx-only sheets", () => {
    const hidden = { ...metricsSheet, xlsxOnly: true };
    expect(sheetsToCsv([hidden, usersSheet])).toBe("\uFEFFName\r\nA\r\n");
  });
});
