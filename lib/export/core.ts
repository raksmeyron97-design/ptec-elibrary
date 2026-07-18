// Shared vocabulary for admin data exports (dashboard, users).
//
// A report is described once as ExportSheet[] + ExportContext and can then be
// serialised either as CSV (lib/export/csv.ts) or as a styled Excel workbook
// (lib/export/xlsx.ts, server-only). Pure module — no server imports, so
// column definitions can be unit-tested and shared with client code.

export type ExportCellKind =
  /** Free text (default). Formula-guarded in CSV. */
  | "string"
  /** Numeric metric — exported as a real number cell, never formula-guarded. */
  | "number"
  /** "YYYY-MM-DD" (or ISO timestamp) — becomes a real date cell in XLSX. */
  | "date"
  /**
   * Identifier-like text that must stay text: phone numbers (+855…, leading
   * zeros), UUIDs. XLSX stores these with the "@" text format; CSV wraps
   * phone-like values as ="…" so Excel neither drops the + / leading zeros
   * nor treats them as formulas.
   */
  | "text";

export type ExportColumn<T> = {
  key: string;
  header: string;
  value: (row: T) => string | number | null | undefined;
  kind?: ExportCellKind;
  /** Column width in characters for XLSX (estimated from content if omitted). */
  width?: number;
};

export type ExportSheet<T = unknown> = {
  /** Worksheet name (also used as the CSV section heading when multiple). */
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Skip this sheet in CSV output (e.g. the XLSX-only Summary sheet). */
  xlsxOnly?: boolean;
};

/**
 * Erase a sheet's row type so heterogeneous sheets can travel in one
 * ExportSheet[] (the serialisers only ever pair a sheet's own columns with
 * its own rows, so the cast is safe).
 */
export function defineSheet<T>(sheet: ExportSheet<T>): ExportSheet {
  return sheet as unknown as ExportSheet;
}

export type ExportContext = {
  /** Report title, e.g. "PTEC e-Library — Dashboard Overview". */
  title: string;
  /** Label/value lines shown above the table in XLSX (period, filters, …). */
  lines: [label: string, value: string][];
  generatedAt: Date;
};

const TZ = "Asia/Phnom_Penh";

/** "18 Jul 2026, 14:05 (Asia/Phnom_Penh)" — the library's local time. */
export function formatGeneratedAt(d: Date): string {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${s} (${TZ})`;
}

/** Today's "YYYY-MM-DD" in library-local time, for filenames. */
export function exportDateStamp(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "ptec-users" → "ptec-users-2026-07-18.xlsx" (base sanitised to [a-z0-9-]). */
export function exportFilename(base: string, ext: "csv" | "xlsx", now: Date = new Date()): string {
  const safe = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${safe}-${exportDateStamp(now)}.${ext}`;
}

export const EXPORT_MIME = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export type ExportFormat = keyof typeof EXPORT_MIME;

export function parseExportFormat(raw: string | null | undefined): ExportFormat {
  return raw === "xlsx" ? "xlsx" : "csv";
}
