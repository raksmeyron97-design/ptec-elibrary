// CSV serialisation for dashboard exports. Pure module (unit-tested).
//
// Security: values that could be interpreted as formulas by Excel/Sheets
// (=, +, -, @, tab, CR) are prefixed with a single quote — CSV formula
// injection is a real attack vector when exports contain user-generated
// content (book titles, search terms).

export type CsvColumn<T> = {
  key: string;
  header: string;
  value: (row: T) => string | number | null | undefined;
};

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function escapeCsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw);
  if (FORMULA_TRIGGER.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV string (with BOM so Excel opens Khmer text as UTF-8). */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(c.value(row))).join(","),
  );
  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}
