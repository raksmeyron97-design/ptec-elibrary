"use client";
// app/admin/catalogs/CsvImportModal.tsx

import { useState, useTransition, useRef } from "react";
import { importCatalogCsv } from "@/app/(admin)/admin/(protected)/catalogs/actions";

const CSV_TEMPLATE = `title,author,isbn,year,language,category,department,shelf_location,copies_total,description,accession_number,cover_url
Introduction to Law,John Smith,978-0-000-00000-0,2020,en,Law,Public Law,A-1-01,3,A comprehensive intro to law.,ACC-001,https://drive.google.com/file/d/1QuNSZO4OMf2tTlv89GfG4PGdCK2VE2sW/view?usp=sharing
ច្បាប់រដ្ឋប្បវេណី,ក សុខា,,2019,km,Law,Civil Law,B-2-05,2,ច្បាប់រដ្ឋប្បវេណីខ្មែរ,ACC-002,`;

// ─── Google Drive link converter ─────────────────────────────────────────────
function convertGoogleDriveUrl(url: string): string {
  if (!url) return url;
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://lh3.googleusercontent.com/d/${fileMatch[1]}`;
  const idMatch = url.match(/drive\.google\.com\/(?:open|uc)\?.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  return url;
}

// ─── Delimiter auto-detection ─────────────────────────────────────────────────
function detectDelimiter(csv: string): "," | ";" | "\t" {
  const firstLine = csv.split(/\r?\n/)[0] ?? "";
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as "," | ";" | "\t");
}

// ─── Normalize: any delimiter → comma, strip \r ───────────────────────────────
function normalizeCsv(csv: string): string {
  const delimiter = detectDelimiter(csv);
  const clean = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (delimiter === ",") return clean;
  return clean
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      const result: string[] = [];
      let inQuotes = false;
      let cell = "";
      
      // ✅ FIX: Use 'for...of' loop for safe iteration over complex Unicode (Khmer)
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; cell += ch; }
        else if (!inQuotes && ch === delimiter) { result.push(cell); cell = ""; }
        else { cell += ch; }
      }
      
      result.push(cell);
      return result.join(",");
    })
    .join("\n");
}

// ─── Convert Drive URLs in cover_url column ───────────────────────────────────
function transformCoverUrls(csv: string): string {
  const normalized = normalizeCsv(csv);
  const lines = normalized.split(/\r?\n/);
  if (lines.length === 0) return normalized;
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const coverIdx = header.indexOf("cover_url");
  if (coverIdx === -1) return normalized;
  return lines
    .map((line, i) => {
      if (i === 0 || !line.trim()) return line;
      const cols = line.split(",");
      if (cols[coverIdx] !== undefined) {
        cols[coverIdx] = convertGoogleDriveUrl(cols[coverIdx].trim());
      }
      return cols.join(",");
    })
    .join("\n");
}

// ─── Deduplicate rows by accession_number / isbn ──────────────────────────────
// Prevents Postgres "ON CONFLICT DO UPDATE command cannot affect row a second
// time" error when the same conflict-key appears more than once in a batch.
// Last occurrence wins (most recent data is kept).
function deduplicateCsv(csv: string): { csv: string; removed: number } {
  const lines = csv.split(/\r?\n/);
  if (lines.length <= 1) return { csv, removed: 0 };

  const header  = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const accIdx  = header.indexOf("accession_number");
  const isbnIdx = header.indexOf("isbn");

  const dataLines = lines.slice(1).filter((l) => l.trim());

  // Map conflict-key → last seen row index
  const seen = new Map<string, number>();
  dataLines.forEach((line, i) => {
    const cols = line.split(",");
    const acc  = accIdx  !== -1 ? cols[accIdx]?.trim()  : "";
    const isbn = isbnIdx !== -1 ? cols[isbnIdx]?.trim() : "";
    if (acc)  seen.set(`acc:${acc}`,   i);
    if (isbn) seen.set(`isbn:${isbn}`, i);
  });

  const keepIdx = new Set(seen.values());
  // Keep rows with no conflict key (no isbn, no accession_number) — safe to insert
  dataLines.forEach((line, i) => {
    const cols = line.split(",");
    const acc  = accIdx  !== -1 ? cols[accIdx]?.trim()  : "";
    const isbn = isbnIdx !== -1 ? cols[isbnIdx]?.trim() : "";
    if (!acc && !isbn) keepIdx.add(i);
  });

  const kept    = dataLines.filter((_, i) => keepIdx.has(i));
  const removed = dataLines.length - kept.length;
  return { csv: [lines[0], ...kept].join("\n"), removed };
}

export default function CsvImportModal() {
  const [open, setOpen]                    = useState(false);
  const [csvText, setCsvText]              = useState("");
  const [result, setResult]                = useState<string | null>(null);
  const [error, setError]                  = useState<string | null>(null);
  const [isPending, startTransition]       = useTransition();
  const [convertedCount, setConvertedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string ?? "");
    
    // ✅ FIX: Force UTF-8 reading so Khmer characters display correctly
    reader.readAsText(file, "UTF-8");
  }

  function countDriveLinks(csv: string): number {
    return (csv.match(/drive\.google\.com\/(file\/d\/|open\?|uc\?)/g) ?? []).length;
  }

  function handleImport() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const transformed               = transformCoverUrls(csvText);
        const { csv: deduped, removed } = deduplicateCsv(transformed);
        const count                     = countDriveLinks(csvText);
        setConvertedCount(count);

        const fd = new FormData();
        fd.set("csv_text", deduped);
        const res = await importCatalogCsv(fd);
        setResult(
          `✅ Imported ${res.imported} book${res.imported !== 1 ? "s" : ""} successfully!` +
          (count   > 0 ? ` · ${count} Drive link${count !== 1 ? "s" : ""} converted`      : "") +
          (removed > 0 ? ` · ${removed} duplicate row${removed !== 1 ? "s" : ""} skipped` : "")
        );
        setCsvText("");
      } catch (err: any) {
        setError(err.message ?? "Import failed");
      }
    });
  }

  const driveLinks = countDriveLinks(csvText);
  const delimiter  = csvText.trim() ? detectDelimiter(csvText) : ",";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Import CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h2 className="font-bold text-slate-800">Import Books from CSV</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* Format hint */}
              <div className="rounded-xl bg-[#007c91]/8 border border-[#007c91]/20 p-4">
                <p className="text-xs font-semibold text-[#007c91] mb-2">
                  CSV Format <span className="font-normal text-slate-500">(required: title, author)</span>
                </p>
                <pre className="text-[10px] text-slate-600 overflow-x-auto leading-relaxed whitespace-pre">
                  {`title, author, isbn, year, language, category,\ndepartment, shelf_location, copies_total,\ndescription, accession_number, cover_url`}
                </pre>

                {/* Google Drive note */}
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.433 22l4-6.928H22l-4 6.928H4.433zm-.866-1.5L2 17.072 9.567 4h3.464L5.433 17.072 3.567 20.5zm15.3-3.428H8.3l-1.732-3H17.3l1.733 3z" />
                  </svg>
                  <p className="text-[10px] leading-relaxed text-blue-700">
                    <span className="font-bold">Google Drive links auto-converted.</span>{" "}
                    Paste share links directly in{" "}
                    <code className="font-mono bg-blue-100 px-1 rounded">cover_url</code>{" "}
                    — converted to direct image URLs on import.
                    Semicolon / tab delimiters also supported.
                  </p>
                </div>

                <button
                  onClick={() => {
                    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "catalog_import_template.csv";
                    a.click();
                  }}
                  className="mt-2 text-xs font-semibold text-[#007c91] hover:underline"
                >
                  ↓ Download template CSV
                </button>
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Upload CSV File</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFile}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200 transition"
                />
              </div>

              {/* Manual paste */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Or paste CSV text</label>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={6}
                  placeholder={CSV_TEMPLATE}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-700 outline-none focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 resize-none"
                />
              </div>

              {/* Live preview badges */}
              {csvText.trim() && (() => {
                const lines = csvText.trim().split(/\r?\n/).slice(1).filter(Boolean);
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-slate-400">
                      {lines.length} row{lines.length !== 1 ? "s" : ""} detected
                    </p>

                    {/* Delimiter badge */}
                    {delimiter !== "," && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {delimiter === ";" ? "Semicolon" : "Tab"} — will auto-convert
                      </span>
                    )}

                    {/* Drive links badge */}
                    {driveLinks > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-semibold text-blue-600">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4.433 22l4-6.928H22l-4 6.928H4.433zm-.866-1.5L2 17.072 9.567 4h3.464L5.433 17.072 3.567 20.5zm15.3-3.428H8.3l-1.732-3H17.3l1.733 3z" />
                        </svg>
                        {driveLinks} Drive link{driveLinks !== 1 ? "s" : ""} will be converted
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Result / error */}
              {result && (
                <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700">
                  {result}
                </p>
              )}
              {error && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!csvText.trim() || isPending}
                  className="rounded-xl bg-gradient-to-br from-[#0a1629] to-[#007c91] px-6 py-2 text-sm font-semibold text-white shadow transition hover:shadow-lg disabled:opacity-50"
                >
                  {isPending ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}