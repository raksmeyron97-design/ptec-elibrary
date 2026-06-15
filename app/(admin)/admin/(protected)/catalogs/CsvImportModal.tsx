"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

 
;
/* eslint-disable @typescript-eslint/no-unused-vars */

// app/admin/catalogs/CsvImportModal.tsx

import { useState, useTransition, useRef } from "react";
import Papa from "papaparse";
import { importCatalogCsv } from "@/app/(admin)/admin/(protected)/catalogs/actions";

const CSV_TEMPLATE = `title,author,isbn,year,language,category,department,shelf_location,copies_total,description,accession_number,barcode,cover_url,keywords
Introduction to Law,John Smith,978-0-000-00000-0,2020,en,Law,Public Law,A-1-01,1,A comprehensive intro to law.,ACC-001,33697,https://drive.google.com/file/d/1QuNSZO4OMf2tTlv89GfG4PGdCK2VE2sW/view?usp=sharing,"law, intro, guide"
Introduction to Law,John Smith,978-0-000-00000-0,2020,en,Law,Public Law,A-1-01,1,A comprehensive intro to law.,ACC-001,33698,https://drive.google.com/file/d/1QuNSZO4OMf2tTlv89GfG4PGdCK2VE2sW/view?usp=sharing,"law, intro, guide"
ច្បាប់រដ្ឋប្បវេណី,ក សុខា,,2019,km,Law,Civil Law,B-2-05,1,ច្បាប់រដ្ឋប្បវេណីខ្មែរ,ACC-002,33699,,`;

// ─── Google Drive link converter ─────────────────────────────────────────────
function convertGoogleDriveUrl(url: string): string {
  if (!url) return url;
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://lh3.googleusercontent.com/d/${fileMatch[1]}`;
  const idMatch = url.match(/drive\.google\.com\/(?:open|uc)\?.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  return url;
}

// ─── CSV Processing ──────────────────────────────────────────────────────────
function processCsv(csv: string): { processedCsv: string; removed: number; convertedLinks: number; error: string | null } {
  try {
    const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return { processedCsv: "", removed: 0, convertedLinks: 0, error: parsed.errors[0].message };
    }

    let convertedLinks = 0;
    let data = parsed.data;

    // Transform Cover URLs
    data = data.map((row) => {
      if (row.cover_url) {
        const converted = convertGoogleDriveUrl(row.cover_url.trim());
        if (converted !== row.cover_url.trim()) convertedLinks++;
        row.cover_url = converted;
      }
      return row;
    });

    const processedCsv = Papa.unparse(data);

    return { processedCsv, removed: 0, convertedLinks, error: null };
  } catch (err: any) {
    return { processedCsv: "", removed: 0, convertedLinks: 0, error: err.message };
  }
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
    
    // Force UTF-8 reading so Khmer characters display correctly
    reader.readAsText(file, "UTF-8");
  }

  function handleImport() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const { processedCsv: deduped, removed, convertedLinks, error: processErr } = processCsv(csvText);
        if (processErr) throw new Error(processErr);
        
        setConvertedCount(convertedLinks);

        const fd = new FormData();
        fd.set("csv_text", deduped);
        const res = await importCatalogCsv(fd);
        setResult(
          `✅ Imported ${res.imported} book${res.imported !== 1 ? "s" : ""} successfully!` +
          (convertedLinks > 0 ? ` · ${convertedLinks} Drive link${convertedLinks !== 1 ? "s" : ""} converted` : "") +
          (removed > 0 ? ` · ${removed} duplicate row${removed !== 1 ? "s" : ""} skipped` : "")
        );
        setCsvText("");
      } catch (err: any) {
        setError(err.message ?? "Import failed");
      }
    });
  }

  const driveLinks = (csvText.match(/drive\.google\.com\/(file\/d\/|open\?|uc\?)/g) ?? []).length;
  
  let delimiter = ",";
  if (csvText.trim()) {
    const parsedMeta = Papa.parse(csvText.trim(), { preview: 1 });
    if (parsedMeta.meta.delimiter) delimiter = parsedMeta.meta.delimiter;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body transition hover:bg-paper"
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
          <div className="w-full max-w-2xl rounded-2xl bg-bg-surface shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-divider bg-paper px-6 py-4">
              <h2 className="font-bold text-text-heading">Import Books from CSV</h2>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-body transition">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* Format hint */}
              <div className="rounded-xl bg-brand/8 border border-brand/20 p-4">
                <p className="text-xs font-semibold text-brand mb-2">
                  CSV Format <span className="font-normal text-text-muted">(required: title, author)</span>
                </p>
                <pre className="text-[10px] text-text-body overflow-x-auto leading-relaxed whitespace-pre">
                  {`title, author, isbn, year, language, category,\ndepartment, shelf_location, copies_total,\ndescription, accession_number, barcode, cover_url, keywords`}
                </pre>

                {/* Google Drive note */}
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand/5 border border-blue-100 px-3 py-2">
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.433 22l4-6.928H22l-4 6.928H4.433zm-.866-1.5L2 17.072 9.567 4h3.464L5.433 17.072 3.567 20.5zm15.3-3.428H8.3l-1.732-3H17.3l1.733 3z" />
                  </svg>
                  <p className="text-[10px] leading-relaxed text-brand">
                    <span className="font-bold">Google Drive links auto-converted.</span>{" "}
                    Paste share links directly in{" "}
                    <code className="font-mono bg-brand/10 px-1 rounded">cover_url</code>{" "}
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
                  className="mt-2 text-xs font-semibold text-brand hover:underline"
                >
                  ↓ Download template CSV
                </button>
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Upload CSV File</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFile}
                  className="block w-full text-sm text-text-body file:mr-3 file:rounded-lg file:border-0 file:bg-paper file:px-4 file:py-1.5 file:text-xs file:font-semibold file:text-text-body hover:file:bg-paper transition"
                />
              </div>

              {/* Manual paste */}
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Or paste CSV text</label>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={6}
                  placeholder={CSV_TEMPLATE}
                  className="w-full rounded-xl border border-divider bg-paper px-3 py-2.5 text-xs font-mono text-text-body outline-none focus:border-brand focus:ring-2 focus:ring-focus-ring/15 resize-none"
                />
              </div>

              {/* Live preview badges */}
              {csvText.trim() && (() => {
                const lines = csvText.trim().split(/\r?\n/).slice(1).filter(Boolean);
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-text-muted">
                      {lines.length} row{lines.length !== 1 ? "s" : ""} detected
                    </p>

                    {/* Delimiter badge */}
                    {delimiter !== "," && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {delimiter === ";" ? "Semicolon" : delimiter === "\t" ? "Tab" : delimiter} — auto-detected
                      </span>
                    )}

                    {/* Drive links badge */}
                    {driveLinks > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand/5 border border-blue-200 px-2.5 py-0.5 text-[10px] font-semibold text-brand">
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
                  className="rounded-xl border border-divider px-5 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!csvText.trim() || isPending}
                  className="rounded-xl bg-gradient-to-br from-blue-950 to-brand px-6 py-2 text-sm font-semibold text-white shadow transition hover:shadow-lg disabled:opacity-50"
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