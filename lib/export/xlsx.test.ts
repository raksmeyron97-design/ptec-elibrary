import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "./xlsx";
import { defineSheet, type ExportContext } from "./core";

const context: ExportContext = {
  title: "PTEC e-Library — Test Report",
  generatedAt: new Date("2026-07-18T07:00:00Z"),
  lines: [
    ["Period", "Last 30 days"],
    ["Filters", "None"],
  ],
};

type Row = {
  name: string;
  phone: string | null;
  views: number;
  joined: string | null;
};

const rows: Row[] = [
  { name: "សុខ ស៊ីម", phone: "+855 12 345 678", views: 12, joined: "2026-07-01" },
  { name: "=HYPERLINK(evil)", phone: "012345678", views: -3, joined: null },
];

const sheet = defineSheet<Row>({
  name: "Users",
  rows,
  columns: [
    { key: "name", header: "Full Name", value: (r) => r.name },
    { key: "phone", header: "Phone", value: (r) => r.phone, kind: "text" },
    { key: "views", header: "Views", value: (r) => r.views, kind: "number" },
    { key: "joined", header: "Joined Date", value: (r) => r.joined, kind: "date" },
  ],
});

async function roundTrip(...sheets: Parameters<typeof buildWorkbook>[1]) {
  const buffer = await buildWorkbook(context, sheets);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe("buildWorkbook", () => {
  it("produces a loadable workbook with context block, styled frozen header, and auto-filter", async () => {
    const wb = await roundTrip(sheet);
    const ws = wb.getWorksheet("Users")!;
    expect(ws).toBeDefined();

    // Context block
    expect(ws.getCell("A1").value).toBe("PTEC e-Library — Test Report");
    expect(ws.getCell("A2").value).toBe("Report");
    expect(ws.getCell("A3").value).toBe("Generated");
    expect(String(ws.getCell("B3").value)).toContain("Asia/Phnom_Penh");
    expect(ws.getCell("A4").value).toBe("Period");
    expect(ws.getCell("B4").value).toBe("Last 30 days");

    // Header row: title + 4 meta lines + blank = row 7
    const headerRow = ws.getRow(7);
    expect(headerRow.getCell(1).value).toBe("Full Name");
    expect(headerRow.getCell(1).font?.bold).toBe(true);
    const fill = headerRow.getCell(1).fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBe("FF1E3A8A");

    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 7 });
    expect(ws.autoFilter).toBeTruthy();
  });

  it("round-trips Khmer text, keeps phones as text, numbers numeric, dates as dates", async () => {
    const wb = await roundTrip(sheet);
    const ws = wb.getWorksheet("Users")!;
    const first = ws.getRow(8);
    expect(first.getCell(1).value).toBe("សុខ ស៊ីម");
    expect(first.getCell(2).value).toBe("+855 12 345 678");
    expect(first.getCell(2).numFmt).toBe("@");
    expect(first.getCell(3).value).toBe(12);
    expect(first.getCell(4).value).toBeInstanceOf(Date);

    const second = ws.getRow(9);
    // Written as a plain string cell — never becomes a live formula.
    expect(second.getCell(1).value).toBe("=HYPERLINK(evil)");
    expect(second.getCell(1).formula).toBeUndefined();
    expect(second.getCell(3).value).toBe(-3);
    expect(second.getCell(4).value).toBeNull();
  });

  it("renders a readable empty state when there are no rows", async () => {
    const empty = defineSheet<Row>({ ...sheet, rows: [] } as never);
    const wb = await roundTrip(empty);
    const ws = wb.getWorksheet("Users")!;
    expect(ws.getRow(8).getCell(1).value).toBe(
      "No records match the selected filters and period.",
    );
  });

  it("supports multiple sheets and sanitises worksheet names", async () => {
    const weird = defineSheet<Row>({ ...sheet, name: "Bad:Name/With*Chars[]?" } as never);
    const wb = await roundTrip(sheet, weird);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Users", "Bad Name With Chars"]);
  });
});
