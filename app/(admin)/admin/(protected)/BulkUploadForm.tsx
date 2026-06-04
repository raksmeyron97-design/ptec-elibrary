"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveBookRecord } from "@/app/(admin)/admin/(protected)/actions";
import { getPresignedUrl } from "@/app/actions/upload";
import { makeUid, bookFolder, bookPdfPath, bookCoverPath } from "@/lib/book-utils";

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
    // 1. Upload PDF
    onStatus("uploading-pdf");
    const uid = makeUid();
    const folder = bookFolder(row.category || "uncategorized", row.title, uid);
    const pdfPath = bookPdfPath(folder);

    const pdfPresigned = await getPresignedUrl(pdfPath, "application/pdf");
    if ("error" in pdfPresigned) throw new Error(pdfPresigned.error);

    const pdfRes = await fetch(pdfPresigned.presignedUrl, {
      method: "PUT", body: pdfFile,
      headers: { "Content-Type": "application/pdf" },
    });
    if (!pdfRes.ok) throw new Error(`PDF upload failed: ${pdfRes.statusText}`);

    // 2. Upload cover (optional, non-fatal)
    let coverUrl: string | null = null;
    if (coverFile) {
      onStatus("uploading-cover");
      try {
        const coverPath = bookCoverPath(folder, coverFile.name);
        const coverPresigned = await getPresignedUrl(coverPath, coverFile.type);
        if (!("error" in coverPresigned)) {
          const coverRes = await fetch(coverPresigned.presignedUrl, {
            method: "PUT", body: coverFile,
            headers: { "Content-Type": coverFile.type },
          });
          if (coverRes.ok) coverUrl = coverPresigned.publicUrl;
        }
      } catch { /* non-fatal */ }
    }

    // 3. Save record
    onStatus("saving");
    const payload = new FormData();
    payload.set("title",      row.title);
    payload.set("author",     row.author);
    payload.set("department", row.department);
    payload.set("category",   row.category);
    payload.set("language",   row.language);
    payload.set("summary",    row.summary ?? "");
    payload.set("isbn",       row.isbn ?? "");
    payload.set("year",       row.year ?? "");
    payload.set("pages",      row.pages ?? "");
    payload.set("fileUrl",    pdfPresigned.publicUrl);
    payload.set("fileSizeKb", String(Math.round(pdfFile.size / 1024)));
    payload.set("coverUrl",   coverUrl ?? "");

    const result = await saveBookRecord(payload);
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
  ) {
    const files = Array.from(e.target.files ?? []);
    const map = new Map<string, File>();
    for (const f of files) {
      // Use bare filename (not full path) as key, lowercased for matching
      map.set(f.name.toLowerCase(), f);
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

  return (
    <div className="space-y-6">

      {/* ── Step 1: CSV Template hint ── */}
      <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-text-heading">Step 1 — Prepare your CSV</h2>
        <p className="mb-4 text-xs text-text-muted">
          Download the template, fill in metadata for each book, and save as <code className="rounded bg-paper px-1 py-0.5 font-mono text-xs">.csv</code>.
        </p>

        {/* Inline CSV template preview */}
        <div className="overflow-x-auto rounded-lg border border-divider bg-paper">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-divider bg-slate-50">
                {["title*","author*","category*","department*","language*","pdf_file*","cover_file","isbn","year","pages","summary"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-text-body">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-text-muted">
                <td className="px-3 py-2">រឿងព្រេង</td>
                <td className="px-3 py-2">សុខ ដារា</td>
                <td className="px-3 py-2">Literature</td>
                <td className="px-3 py-2">Khmer Studies</td>
                <td className="px-3 py-2">Khmer</td>
                <td className="px-3 py-2 font-mono text-brand">book-001.pdf</td>
                <td className="px-3 py-2 font-mono">book-001.jpg</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2">2022</td>
                <td className="px-3 py-2">120</td>
                <td className="px-3 py-2">...</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-text-muted">
          <span className="text-red-500">*</span> Required columns.{" "}
          <code className="font-mono">pdf_file</code> and <code className="font-mono">cover_file</code> must match the exact filename in your folders.
        </p>
      </div>

      {/* ── Step 2: Upload files ── */}
      <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-text-heading">Step 2 — Select files</h2>

        <div className="grid gap-4 md:grid-cols-3">
          {/* CSV */}
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-text-body">
              CSV metadata file <span className="text-red-500">*</span>
            </span>
            <div
              className={`flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition ${
                csvReady
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-divider bg-paper text-text-muted hover:border-brand"
              }`}
            >
              <span className="text-2xl">{csvReady ? "✓" : "📄"}</span>
              <span className="text-xs font-medium">
                {csvReady ? `${csvRows.length} rows parsed` : "Click to select CSV"}
              </span>
            </div>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvChange}
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            />
          </label>

          {/* PDF folder */}
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-text-body">
              PDF folder <span className="text-red-500">*</span>
            </span>
            <div
              className={`flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition ${
                pdfReady
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-divider bg-paper text-text-muted hover:border-brand"
              }`}
            >
              <span className="text-2xl">{pdfReady ? "✓" : "📁"}</span>
              <span className="text-xs font-medium">
                {pdfReady ? `${pdfIndex.size} PDF files` : "Click to select folder"}
              </span>
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              multiple
              // @ts-ignore — webkitdirectory is not in TS types
              webkitdirectory=""
              className="hidden"
              onChange={(e) => handleFolderChange(e, setPdfIndex)}
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            />
          </label>

          {/* Cover folder */}
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-text-body">
              Cover folder{" "}
              <span className="font-normal text-text-muted">(optional)</span>
            </span>
            <div
              className={`flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition ${
                coverIndex.size > 0
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-divider bg-paper text-text-muted hover:border-brand"
              }`}
            >
              <span className="text-2xl">{coverIndex.size > 0 ? "✓" : "🖼️"}</span>
              <span className="text-xs font-medium">
                {coverIndex.size > 0 ? `${coverIndex.size} cover files` : "Click to select folder"}
              </span>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              // @ts-ignore
              webkitdirectory=""
              className="hidden"
              onChange={(e) => handleFolderChange(e, setCoverIndex)}
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            />
          </label>
        </div>

        {parseError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            ⚠️ {parseError}
          </div>
        )}

        {canPreview && !started && (
          <div className="mt-4">
            <button
              type="button"
              onClick={handlePreview}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-divider bg-paper px-4 text-sm font-semibold text-text-body transition hover:border-brand hover:text-brand"
            >
              Preview matches
            </button>
          </div>
        )}
      </div>

      {/* ── Step 3: Preview & Progress table ── */}
      {jobs.length > 0 && (
        <div className="rounded-xl border border-divider bg-bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-divider px-6 py-4">
            <div>
              <h2 className="text-sm font-bold text-text-heading">
                Step 3 — Review &amp; Upload
              </h2>
              <p className="text-xs text-text-muted">
                {total} books · {done} done · {errors} errors
                {missing > 0 && <span className="text-amber-600"> · {missing} PDF missing</span>}
              </p>
            </div>

            {/* Progress bar */}
            {started && total > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-300"
                    style={{ width: `${((done + errors) / total) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-text-muted">
                  {Math.round(((done + errors) / total) * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-divider bg-slate-50 text-xs font-semibold text-text-muted">
                  <th className="px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Title</th>
                  <th className="px-4 py-2.5 text-left">Author</th>
                  <th className="px-4 py-2.5 text-left">PDF</th>
                  <th className="px-4 py-2.5 text-left">Cover</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {jobs.map((job, i) => (
                  <tr
                    key={job.id}
                    className={`transition ${
                      job.status === "done"
                        ? "bg-emerald-50/40"
                        : job.status === "error"
                        ? "bg-red-50/40"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-xs text-text-muted">{i + 1}</td>
                    <td className="max-w-[200px] px-4 py-2.5">
                      <p className="truncate font-medium text-text-body">{job.row.title}</p>
                      <p className="truncate text-xs text-text-muted">{job.row.category} · {job.row.department}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-muted">{job.row.author}</td>
                    <td className="px-4 py-2.5">
                      {job.pdfFile ? (
                        <span className="text-xs text-emerald-600">✓ {job.row.pdf_file}</span>
                      ) : (
                        <span className="text-xs font-semibold text-red-500">✗ {job.row.pdf_file}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-muted">
                      {job.row.cover_file
                        ? job.coverFile
                          ? <span className="text-emerald-600">✓ {job.row.cover_file}</span>
                          : <span className="text-amber-600">✗ {job.row.cover_file}</span>
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={job.status} />
                        {job.error && (
                          <p className="text-xs text-red-600">{job.error}</p>
                        )}
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

          {/* Action buttons */}
          <div className="flex items-center gap-3 border-t border-divider px-6 py-4">
            {!started ? (
              <>
                {missing > 0 && (
                  <p className="text-xs text-amber-600">
                    ⚠️ {missing} book(s) are missing PDF files and will be skipped.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!canStart}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-950 px-5 text-sm font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
                >
                  🚀 Start bulk upload ({jobs.filter((j) => j.pdfFile).length} books)
                </button>
              </>
            ) : running ? (
              <p className="text-sm text-text-muted">
                Uploading {concurrency} books in parallel…
              </p>
            ) : (
              <div className="flex items-center gap-4">
                <p className="text-sm font-semibold text-emerald-700">
                  ✓ Completed: {done} uploaded, {errors} failed
                </p>
                {errors > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // Retry only failed jobs
                      const retryJobs = jobs.filter((j) => j.status === "error");
                      setRunning(true);
                      runQueue(retryJobs, concurrency, updateJob).then(() => setRunning(false));
                    }}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
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
