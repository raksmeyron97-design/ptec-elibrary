// Styled Excel workbook generation for admin exports (server-only — ExcelJS
// is a heavy dependency and exports carry privileged data).
//
// Every sheet gets: a report-title block (title, generated-at, period,
// filters), a bold brand-coloured frozen header row with an auto-filter,
// sensible column widths, zebra striping, and real number/date/text cell
// types (so "+855…" phone numbers and Khmer titles survive untouched).
// Values are only ever written as data — never as formulas — so spreadsheet
// formula injection is impossible by construction.

import "server-only";
import ExcelJS from "exceljs";
import {
  formatGeneratedAt,
  type ExportCellKind,
  type ExportColumn,
  type ExportContext,
  type ExportSheet,
} from "./core";

const BRAND_ARGB = "FF1E3A8A"; // PTEC brand navy (--ptec-brand)
const ZEBRA_ARGB = "FFF3F6FC";
const MUTED_ARGB = "FF64748B";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

const MIN_WIDTH = 9;
const MAX_WIDTH = 46;

/** Excel worksheet names: max 31 chars, no []:*?/\ characters. */
function sheetName(raw: string, index: number): string {
  const cleaned = raw.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function toCell(
  kind: ExportCellKind | undefined,
  raw: string | number | null | undefined,
): { value: ExcelJS.CellValue; numFmt?: string } {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  if (kind === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? { value: n } : { value: String(raw) };
  }
  if (kind === "date") {
    const s = String(raw);
    if (DATE_ONLY.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      return { value: new Date(Date.UTC(y, m - 1, d)), numFmt: "yyyy-mm-dd" };
    }
    if (ISO_TIMESTAMP.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return { value: d, numFmt: "yyyy-mm-dd hh:mm" };
    }
    return { value: s };
  }
  if (kind === "text") return { value: String(raw), numFmt: "@" };
  if (typeof raw === "number") return { value: raw };
  return { value: String(raw) };
}

function estimateWidth<T>(col: ExportColumn<T>, rows: T[]): number {
  let max = col.header.length;
  // Sampling the first 200 rows is enough to size a column.
  for (const row of rows.slice(0, 200)) {
    const v = col.value(row);
    if (v === null || v === undefined) continue;
    const len = String(v).length;
    if (len > max) max = len;
  }
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, max + 2));
}

function addSheet(wb: ExcelJS.Workbook, sheet: ExportSheet, context: ExportContext, index: number) {
  const ws = wb.addWorksheet(sheetName(sheet.name, index));
  const cols = sheet.columns;
  const colCount = Math.max(1, cols.length);

  // ── Context block ─────────────────────────────────────────────────────────
  const titleRow = ws.addRow([context.title]);
  titleRow.font = { bold: true, size: 13, color: { argb: BRAND_ARGB } };
  ws.mergeCells(1, 1, 1, colCount);

  const metaLines: [string, string][] = [
    ["Report", sheet.name],
    ["Generated", formatGeneratedAt(context.generatedAt)],
    ...context.lines,
  ];
  for (const [label, value] of metaLines) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: MUTED_ARGB } };
    row.getCell(2).font = { size: 10, color: { argb: MUTED_ARGB } };
    if (colCount > 2) ws.mergeCells(row.number, 2, row.number, colCount);
  }
  ws.addRow([]);

  // ── Header row ────────────────────────────────────────────────────────────
  const headerRow = ws.addRow(cols.map((c) => c.header));
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_ARGB } };
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });
  const headerRowNumber = headerRow.number;

  // ── Column widths + data alignment defaults ───────────────────────────────
  cols.forEach((c, i) => {
    const width = c.width ?? estimateWidth(c, sheet.rows);
    const column = ws.getColumn(i + 1);
    column.width = width;
  });

  // ── Data rows ─────────────────────────────────────────────────────────────
  if (sheet.rows.length === 0) {
    const empty = ws.addRow(["No records match the selected filters and period."]);
    empty.getCell(1).font = { italic: true, color: { argb: MUTED_ARGB } };
    ws.mergeCells(empty.number, 1, empty.number, colCount);
  } else {
    for (const [rowIndex, dataRow] of sheet.rows.entries()) {
      const row = ws.addRow([]);
      cols.forEach((c, i) => {
        const { value, numFmt } = toCell(c.kind, c.value(dataRow));
        const cell = row.getCell(i + 1);
        cell.value = value;
        if (numFmt) cell.numFmt = numFmt;
        cell.alignment = {
          vertical: "top",
          horizontal: c.kind === "number" ? "right" : "left",
          wrapText: c.kind !== "number" && c.kind !== "date",
        };
        if (rowIndex % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_ARGB } };
        }
      });
    }
  }

  // ── Frozen header + auto-filter over the data table ───────────────────────
  ws.views = [{ state: "frozen", ySplit: headerRowNumber }];
  ws.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber + Math.max(sheet.rows.length, 1), column: colCount },
  };
}

/** Build a finished .xlsx file for the given report. */
export async function buildWorkbook(context: ExportContext, sheets: ExportSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PTEC e-Library";
  wb.created = context.generatedAt;
  wb.modified = context.generatedAt;
  sheets.forEach((sheet, i) => addSheet(wb, sheet, context, i));
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
