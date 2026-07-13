"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

 
;
/* eslint-disable @typescript-eslint/no-unused-vars */


import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveBookRecord } from "@/app/(admin)/admin/(protected)/books/actions";
import { makeUid, bookFolder, bookPdfPath, bookCoverPath } from "@/lib/book-utils";
import {
  FileSpreadsheet, FolderOpen, Image as ImageIcon, Upload as UploadIcon,
  CheckCircle, AlertCircle, RotateCcw, FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RowStatus = "pending" | "uploading-pdf" | "uploading-cover" | "saving" | "done" | "error";

interface CsvRow {
  title: string;
  author: string;
  category: string;
  department: string;
  language: string;
  isbn?: string;
  year?: string;
  pages?: string;
  summary?: string;
  keywords?: string;
  pdf_file: string;
  cover_file?: string;
}

interface BookJob {
  id: string;         // row index as string
  row: CsvRow;
  pdfFile: File | null;
  coverFile: File | null;
  status: RowStatus;
  error?: string;
  slug?: string;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string): CsvRow[] {
  // Handle Windows (\r\n), Unix (\n), and old Mac (\r) line endings
  const lines = text.trim().split(/\r\n|\n|\r/);
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

  const headerLine = lines[0].replace(/^\uFEFF/, '');
  
  // Detect delimiter
  let delimiter = ",";
  if (headerLine.includes("\t")) delimiter = "\t";
  else if (headerLine.includes(";")) delimiter = ";";

  const headers = headerLine.split(delimiter).map((h) => 
    h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, "_")
  );
  const required = ["title", "author", "category", "department", "language", "pdf_file"];

  for (const r of required) {
    if (!headers.includes(r)) {
      throw new Error(`CSV is missing required column: "${r}". Found: ${headers.join(", ")}`);
    }
  }

  return lines.slice(1).filter((l) => l.trim()).map((line, i) => {
    const values: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === delimiter && !inQuote) { values.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    values.push(cur.trim());

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { 
      let val = values[idx] ?? "";
      val = val.replace(/^"|"$/g, '');
      obj[h] = val; 
    });

    if (!obj.title) throw new Error(`Row ${i + 2}: "title" is empty`);
    if (!obj.pdf_file) throw new Error(`Row ${i + 2}: "pdf_file" is empty`);

    return obj as unknown as CsvRow;
  });
}

// ─── Upload a single book ─────────────────────────────────────────────────────

async function uploadBook(
  job: BookJob,
  onStatus: (status: RowStatus, extra?: { error?: string; slug?: string }) => void,
): Promise<void> {
  const { row, pdfFile, coverFile } = job;

  if (!pdfFile) { onStatus("error", { error: `PDF not found: "${row.pdf_file}"` }); return; }

  try {
    // 1. Upload PDF via server proxy (server → R2, no CORS needed)
    onStatus("uploading-pdf");
    const uid = makeUid();
    const folder = bookFolder(row.category || "uncategorized", row.title, uid);
    const pdfPath = bookPdfPath(folder);

    const pdfRes = await fetch("/api/admin/bulk-upload", {
      method: "POST",
      headers: {
        "x-file-path": pdfPath,
        "x-target": "private",
        "x-content-type": "application/pdf",
      },
      body: pdfFile,
    });
    if (!pdfRes.ok) {
      const { error } = await pdfRes.json().catch(() => ({ error: pdfRes.statusText }));
      throw new Error(`PDF upload failed: ${error}`);
    }
    const { url: pdfPublicUrl, contentHash } = await pdfRes.json();

    // 2. Upload cover (optional, non-fatal)
    let coverUrl: string | null = null;
    if (coverFile) {
      onStatus("uploading-cover");
      try {
        const coverPath = bookCoverPath(folder, coverFile.name);
        const coverRes = await fetch("/api/admin/bulk-upload", {
          method: "POST",
          headers: {
            "x-file-path": coverPath,
            "x-target": "public",
            "x-content-type": coverFile.type || "image/jpeg",
          },
          body: coverFile,
        });
        if (coverRes.ok) {
          const { url } = await coverRes.json();
          coverUrl = url;
        }
      } catch { /* non-fatal */ }
    }

    // 3. Save record
    onStatus("saving");
    const result = await saveBookRecord({
      title:      row.title,
      author:     row.author,
      department: row.department,
      category:   row.category,
      language:   row.language,
      summary:    row.summary ?? "",
      isbn:       row.isbn ?? "",
      year:       row.year ?? "",
      pages:      row.pages ?? "",
      tags:       row.keywords ?? "",
      fileUrl:    pdfPublicUrl,
      fileSizeKb: String(Math.round(pdfFile.size / 1024)),
      coverUrl:   coverUrl ?? "",
      contentHash: contentHash ?? "",
    });
    if (result && "error" in result) throw new Error(result.error);

    onStatus("done", { slug: (result as any)?.slug });
  } catch (err) {
    onStatus("error", { error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// ─── Parallel queue runner ────────────────────────────────────────────────────

async function runQueue(
  jobs: BookJob[],
  concurrency: number,
  onJobUpdate: (id: string, status: RowStatus, extra?: { error?: string; slug?: string }) => void,
) {
  let i = 0;

  async function next(): Promise<void> {
    const idx = i++;
    if (idx >= jobs.length) return;
    const job = jobs[idx];
    await uploadBook(job, (status, extra) => onJobUpdate(job.id, status, extra));
    await next();
  }

  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, () => next());
  await Promise.all(workers);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<RowStatus, { label: string; cls: string }> = {
  pending:          { label: "Pending",         cls: "bg-slate-100 text-slate-500" },
  "uploading-pdf":  { label: "Uploading PDF…",  cls: "bg-blue-100 text-blue-600" },
  "uploading-cover":{ label: "Uploading cover…",cls: "bg-cyan-100 text-cyan-600" },
  saving:           { label: "Saving…",         cls: "bg-amber-100 text-amber-600" },
  done:             { label: "Done ✓",           cls: "bg-emerald-100 text-emerald-700" },
  error:            { label: "Error",            cls: "bg-red-100 text-red-600" },
};

function StatusBadge({ status }: { status: RowStatus }) {
  const { label, cls } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {(status === "uploading-pdf" || status === "uploading-cover" || status === "saving") && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BulkUploadForm() {
  const router = useRouter();

  // File inputs
  const csvInputRef  = useRef<HTMLInputElement>(null);
  const pdfInputRef  = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Parsed state
  const [csvRows,    setCsvRows]    = useState<CsvRow[]>([]);
  const [pdfIndex,   setPdfIndex]   = useState<Map<string, File>>(new Map());
  const [coverIndex, setCoverIndex] = useState<Map<string, File>>(new Map());

  // Job state
  const [jobs,    setJobs]    = useState<BookJob[]>([]);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);

  // Parse error
  const [parseError, setParseError] = useState<string | null>(null);

  // Concurrency
  const [concurrency] = useState(4);

  // ── Handlers ──────────────────────────────────────────────────

  function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setCsvRows([]);
    setJobs([]);
    setStarted(false);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(reader.result as string);
        setCsvRows(rows);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "CSV parse error");
      }
    };
    reader.readAsText(file);
  }

  function handleFolderChange(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<Map<string, File>>>,
    extensions?: string[],
  ) {
    const files = Array.from(e.target.files ?? []);
    const map = new Map<string, File>();
    for (const f of files) {
      const name = f.name.toLowerCase();
      if (!extensions || extensions.some((ext) => name.endsWith(ext))) {
        map.set(name, f);
      }
    }
    setter(map);
  }

  // Build jobs and cross-reference files
  const buildJobs = useCallback((): BookJob[] => {
    return csvRows.map((row, i) => ({
      id: String(i),
      row,
      pdfFile:   pdfIndex.get(row.pdf_file.toLowerCase()) ?? null,
      coverFile: row.cover_file ? (coverIndex.get(row.cover_file.toLowerCase()) ?? null) : null,
      status:    "pending",
    }));
  }, [csvRows, pdfIndex, coverIndex]);

  function handlePreview() {
    setJobs(buildJobs());
    setStarted(false);
  }

  function updateJob(id: string, status: RowStatus, extra?: { error?: string; slug?: string }) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id ? { ...j, status, error: extra?.error, slug: extra?.slug } : j,
      ),
    );
  }

  async function handleStart() {
    const built = buildJobs();
    setJobs(built);
    setStarted(true);
    setRunning(true);
    await runQueue(built, concurrency, updateJob);
    setRunning(false);
  }

  // ── Derived stats ──────────────────────────────────────────────

  const total   = jobs.length;
  const done    = jobs.filter((j) => j.status === "done").length;
  const errors  = jobs.filter((j) => j.status === "error").length;
  const missing = jobs.filter((j) => j.status === "pending" && !j.pdfFile).length;

  const csvReady   = csvRows.length > 0;
  const pdfReady   = pdfIndex.size > 0;
  const canPreview = csvReady && pdfReady;
  const canStart   = canPreview && jobs.length > 0 && !running;

  // ─── Render ──────────────────────────────────────────────────────────────────

  // ── File drop zone helper ─────────────────────────────────────
  type DropZoneProps = {
    ready: boolean;
    readyLabel: string;
    idleLabel: string;
    icon: React.ReactNode;
    checkedIcon: React.ReactNode;
  };

  function DropZoneDisplay({ ready, readyLabel, idleLabel, icon, checkedIcon }: DropZoneProps) {
    return (
      <div
        className="flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all"
        style={
          ready
            ? { borderColor: "#0f9d6b", background: "rgba(15,157,107,0.05)", color: "#0f9d6b" }
            : { borderColor: "var(--ptec-divider)", background: "var(--ptec-paper)", color: "var(--ptec-text-muted)" }
        }
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{
          background: ready ? "rgba(15,157,107,0.12)" : "rgba(30,58,138,0.08)",
        }}>
          {ready ? checkedIcon : icon}
        </span>
        <span className="text-xs font-semibold">{ready ? readyLabel : idleLabel}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Step 1: CSV Template ── */}
      <div className="form-card-accent overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
          <span className="sec-chip sec-chip--files">
            <FileSpreadsheet className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-text-heading">Step 1 — Prepare your CSV</h2>
            <p className="text-xs text-text-muted">
              Fill in metadata for each book and save as{" "}
              <code className="rounded bg-paper px-1 py-0.5 font-mono">.csv</code>
            </p>
          </div>
        </div>

        <div className="p-6">
          <div className="overflow-x-auto rounded-xl border border-divider bg-paper">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-divider bg-bg-surface">
                  {["title*","author*","category*","department*","language*","pdf_file*","cover_file","keywords","isbn","year","pages","summary"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="text-text-muted">
                  <td className="px-3 py-2.5">រឿងព្រេង</td>
                  <td className="px-3 py-2.5">សុខ ដារា</td>
                  <td className="px-3 py-2.5">Literature</td>
                  <td className="px-3 py-2.5">Khmer Studies</td>
                  <td className="px-3 py-2.5">Khmer</td>
                  <td className="px-3 py-2.5 font-mono text-brand">book-001.pdf</td>
                  <td className="px-3 py-2.5 font-mono">book-001.jpg</td>
                  <td className="px-3 py-2.5">legend, folk</td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5">2022</td>
                  <td className="px-3 py-2.5">120</td>
                  <td className="px-3 py-2.5">…</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[11px] text-text-muted">
            <span className="text-rose-500">*</span> Required.{" "}
            <code className="font-mono">pdf_file</code> and <code className="font-mono">cover_file</code>{" "}
            must match the exact filenames in your folders.
          </p>
        </div>
      </div>

      {/* ── Step 2: Select files ── */}
      <div className="form-card-accent overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
          <span className="sec-chip sec-chip--details">
            <FolderOpen className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-text-heading">Step 2 — Select files</h2>
            <p className="text-xs text-text-muted">CSV, PDF folder, and optional cover folder</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* CSV */}
            <label className="flex flex-col gap-2 cursor-pointer">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                CSV file <span className="text-rose-500">*</span>
              </span>
              <DropZoneDisplay
                ready={csvReady}
                readyLabel={`${csvRows.length} rows parsed`}
                idleLabel="Click to select CSV"
                icon={<FileSpreadsheet className="h-4 w-4" style={{ color: "var(--ptec-brand)" }} />}
                checkedIcon={<CheckCircle className="h-4 w-4 text-[#0f9d6b]" />}
              />
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleCsvChange}
                onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
              />
            </label>

            {/* PDFs */}
            <label className="flex flex-col gap-2 cursor-pointer">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                PDF files <span className="text-rose-500">*</span>
              </span>
              <DropZoneDisplay
                ready={pdfReady}
                readyLabel={`${pdfIndex.size} PDF files`}
                idleLabel="Click to select PDFs"
                icon={<FileText className="h-4 w-4" style={{ color: "var(--ptec-brand)" }} />}
                checkedIcon={<CheckCircle className="h-4 w-4 text-[#0f9d6b]" />}
              />
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                {...({ webkitdirectory: "", mozdirectory: "" } as Record<string, unknown>)}
                className="hidden"
                onChange={(e) => handleFolderChange(e, setPdfIndex, [".pdf"])}
                onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
              />
            </label>

            {/* Covers */}
            <label className="flex flex-col gap-2 cursor-pointer">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Cover files{" "}
                <span className="font-normal normal-case tracking-normal text-text-muted">(optional)</span>
              </span>
              <DropZoneDisplay
                ready={coverIndex.size > 0}
                readyLabel={`${coverIndex.size} cover files`}
                idleLabel="Click to select covers"
                icon={<ImageIcon className="h-4 w-4" style={{ color: "var(--ptec-brand)" }} />}
                checkedIcon={<CheckCircle className="h-4 w-4 text-[#0f9d6b]" />}
              />
              <input
                ref={coverInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                multiple
                {...({ webkitdirectory: "", mozdirectory: "" } as Record<string, unknown>)}
                className="hidden"
                onChange={(e) => handleFolderChange(e, setCoverIndex, [".jpg", ".jpeg", ".png", ".webp", ".avif"])}
                onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
              />
            </label>
          </div>

          {parseError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{parseError}</p>
            </div>
          )}

          {canPreview && !started && (
            <button
              type="button"
              onClick={handlePreview}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-divider bg-paper px-4 text-sm font-semibold text-text-body transition-all hover:border-brand hover:bg-bg-surface hover:text-brand"
            >
              Preview file matches
            </button>
          )}
        </div>
      </div>

      {/* ── Step 3: Review & Upload ── */}
      {jobs.length > 0 && (
        <div className="form-card-accent overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-divider bg-paper/60 px-6 py-4">
            <div className="flex items-center gap-3.5">
              <span className="sec-chip sec-chip--summary">
                <UploadIcon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-text-heading">Step 3 — Review &amp; Upload</h2>
                <p className="text-xs text-text-muted">
                  {total} books · {done} done · {errors} errors
                  {missing > 0 && (
                    <span style={{ color: "#d97706" }}> · {missing} PDF missing</span>
                  )}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            {started && total > 0 && (
              <div className="flex shrink-0 items-center gap-3">
                <div className="h-2 w-36 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${((done + errors) / total) * 100}%`,
                      background: errors > 0
                        ? "linear-gradient(90deg,#0f9d6b,#d97706)"
                        : "#0f9d6b",
                    }}
                  />
                </div>
                <span className="text-xs font-bold" style={{ color: "#0f9d6b" }}>
                  {Math.round(((done + errors) / total) * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b border-divider text-[11px] font-bold uppercase tracking-wider text-text-muted"
                  style={{ background: "var(--ptec-paper)" }}
                >
                  <th className="px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Title</th>
                  <th className="px-4 py-2.5 text-left">Author</th>
                  <th className="px-4 py-2.5 text-left">PDF</th>
                  <th className="px-4 py-2.5 text-left">Cover</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {jobs.map((job, i) => (
                  <tr
                    key={job.id}
                    className="transition-colors"
                    style={
                      job.status === "done"
                        ? { background: "rgba(15,157,107,0.04)" }
                        : job.status === "error"
                        ? { background: "rgba(239,68,68,0.04)" }
                        : undefined
                    }
                  >
                    <td className="px-4 py-3 text-xs text-text-muted">{i + 1}</td>
                    <td className="max-w-[200px] px-4 py-3">
                      <p className="truncate text-sm font-medium text-text-body">{job.row.title}</p>
                      <p className="truncate text-xs text-text-muted">{job.row.category} · {job.row.department}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">{job.row.author}</td>
                    <td className="px-4 py-3">
                      {job.pdfFile ? (
                        <span className="text-xs font-medium text-[#0f9d6b]">✓ {job.row.pdf_file}</span>
                      ) : (
                        <span className="text-xs font-semibold text-red-500">✗ {job.row.pdf_file}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {job.row.cover_file
                        ? job.coverFile
                          ? <span className="text-[#0f9d6b]">✓ {job.row.cover_file}</span>
                          : <span style={{ color: "#d97706" }}>✗ {job.row.cover_file}</span>
                        : <span className="text-text-muted">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={job.status} />
                        {job.error && <p className="text-xs text-red-600">{job.error}</p>}
                        {job.slug && (
                          <a
                            href={`/books/${job.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand underline"
                          >
                            View →
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer actions */}
          <div className="flex flex-wrap items-center gap-3 border-t border-divider px-6 py-4">
            {!started ? (
              <>
                {missing > 0 && (
                  <p className="text-xs" style={{ color: "#d97706" }}>
                    {missing} book(s) missing PDF files will be skipped.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!canStart}
                  className="btn-brand-gradient inline-flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UploadIcon className="h-4 w-4" />
                  Start bulk upload ({jobs.filter((j) => j.pdfFile).length} books)
                </button>
              </>
            ) : running ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Uploading {concurrency} books in parallel…
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <p className="text-sm font-semibold" style={{ color: "#0f9d6b" }}>
                  Completed: {done} uploaded{errors > 0 ? `, ${errors} failed` : ""}
                </p>
                {errors > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const retryJobs = jobs.filter((j) => j.status === "error");
                      setRunning(true);
                      runQueue(retryJobs, concurrency, updateJob).then(() => setRunning(false));
                    }}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry {errors} failed
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
