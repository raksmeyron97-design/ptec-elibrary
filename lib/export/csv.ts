// CSV serialisation for admin exports. Pure module (unit-tested).
//
// Excel-compatibility rules (why the old client exports rendered in one
// column / as mojibake):
//  - UTF-8 BOM prefix — without it, Excel decodes Khmer as Windows-1252.
//  - CRLF row endings (RFC 4180; what Excel expects).
//  - RFC 4180 quoting: cells containing commas, quotes, line breaks, or
//    leading/trailing whitespace are quoted; embedded quotes are doubled.
//  - No "sep=," hint line: Excel ignores the BOM when the file starts with
//    sep=, and falls back to ANSI — which corrupts Khmer. The XLSX export is
//    the answer for locales whose list separator isn't a comma.
//
// Security: string values that could be interpreted as formulas by
// Excel/Sheets (=, +, -, @, tab, CR) are prefixed with a single quote (the
// OWASP-documented neutralisation) — CSV formula injection is a real attack
// vector when exports contain user-generated content (names, search terms).
// Real numbers are emitted as numbers and never guarded, so negative metrics
// stay numeric.

import type { ExportColumn, ExportSheet } from "./core";

/** @deprecated alias kept for existing call sites — same shape as ExportColumn. */
export type CsvColumn<T> = ExportColumn<T>;

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\n\r]|^\s|\s$/;
/** Phone-like: leading + or digit, then digits/spaces/()-./ only. */
const PHONE_LIKE = /^[+0-9][0-9 ().\/-]{0,29}$/;

function quote(s: string): string {
  return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function escapeCsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : "";
  let s = raw;
  if (FORMULA_TRIGGER.test(s)) s = `'${s}`;
  return quote(s);
}

/**
 * Identifier-like text ("text" columns). Phone-like values are wrapped as
 * ="…" — the documented way to keep Excel from stripping "+855" or leading
 * zeros; the value sits inside a formula *string literal* (quotes doubled),
 * so nothing executes. Anything else falls back to the standard guard.
 */
export function escapeCsvTextCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw);
  if (s === "") return "";
  if (PHONE_LIKE.test(s)) return `"=""${s}"""`;
  return escapeCsvCell(s);
}

function cell<T>(col: ExportColumn<T>, row: T): string {
  const v = col.value(row);
  return col.kind === "text" ? escapeCsvTextCell(v) : escapeCsvCell(v);
}

/** Build a CSV string (with BOM so Excel opens Khmer text as UTF-8). */
export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => cell(c, row)).join(","));
  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}

/**
 * Serialise the CSV-eligible sheets of a report. A single sheet is a plain
 * table; multiple sheets become sections separated by a blank line, each
 * introduced by its sheet name (mixing shapes in one table would be worse).
 */
export function sheetsToCsv(sheets: ExportSheet[]): string {
  const included = sheets.filter((s) => !s.xlsxOnly);
  if (included.length === 1) {
    const s = included[0];
    return toCsv(s.rows, s.columns);
  }
  const parts = included.map((s, i) => {
    const body = toCsv(s.rows, s.columns);
    const section = escapeCsvCell(s.name) + "\r\n" + body.slice(1); // strip inner BOM
    return i === 0 ? "\uFEFF" + section : section;
  });
  return parts.join("\r\n");
}
