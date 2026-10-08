// Reading a Search Console Performance export (SEO audit 2026-10, WI-9).
// Pure apart from the Buffer/strings it is handed.
//
// The export is a ZIP (or the same CSVs unzipped): Queries.csv, Pages.csv,
// Countries.csv, Devices.csv, Search appearance.csv, Dates.csv, Filters.csv.
// Headers are localised by GSC ("Top queries", "Clicks", "Impressions",
// "CTR" as "3.2%", "Position"); a column we cannot find is reported, never
// filled with a zero.

export type Row = { key: string; clicks: number | null; impressions: number | null; ctr: number | null; position: number | null };
export type GscExport = { queries: Row[] | null; pages: Row[] | null; dates: Row[] | null; missing: string[] };

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const num = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = Number(v.replace(/%$/, "").replace(/,/g, "").trim());
  return v.trim() === "" || Number.isNaN(n) ? null : v.trim().endsWith("%") ? n / 100 : n;
};

/** One table, by header names (English GSC labels; matched case-insensitively). */
export function readTable(text: string): Row[] | null {
  const [header, ...body] = parseCsv(text);
  if (!header) return null;
  const h = header.map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
  const key = 0;
  const c = col("clicks");
  const i = col("impressions");
  const r = col("ctr");
  const pos = col("position");
  if (c < 0 && i < 0) return null;
  return body.map((f) => ({
    key: (f[key] ?? "").trim(),
    clicks: c < 0 ? null : num(f[c]),
    impressions: i < 0 ? null : num(f[i]),
    ctr: r < 0 ? null : num(f[r]),
    position: pos < 0 ? null : num(f[pos]),
  }));
}

export function readExport(files: ReadonlyMap<string, string>): GscExport {
  const find = (name: string) => {
    for (const [k, v] of files) if (k.split("/").pop()?.toLowerCase() === name.toLowerCase()) return v;
    return undefined;
  };
  const missing: string[] = [];
  const table = (name: string) => {
    const text = find(name);
    if (text === undefined) {
      missing.push(name);
      return null;
    }
    const rows = readTable(text);
    if (!rows) missing.push(`${name} (no metric columns)`);
    return rows;
  };
  return { queries: table("Queries.csv"), pages: table("Pages.csv"), dates: table("Dates.csv"), missing };
}
