"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useCallback } from "react";
import { saveBookRecord } from "@/app/(admin)/admin/(protected)/books/actions";
import { makeUid, bookFolder, bookPdfPath, bookCoverPath } from "@/lib/book-utils";
import { getPdfPageCount } from "@/lib/pdf-client-utils";
import { FormSection, BTN_PRIMARY, BTN_SECONDARY } from "@/components/admin/kit/form";
import { EBOOKS_BASE_PATH } from "@/lib/admin/ebooks-url";
import Link from "next/link";
import {
  FileSpreadsheet, Image as ImageIcon, Upload as UploadIcon,
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

    // Auto-detect pages from PDF if not specified in CSV row
    let pages = (row.pages ?? "").trim();
    if (!pages && pdfFile) {
      try {
        const detected = await getPdfPageCount(pdfFile);
        if (detected) pages = String(detected);
      } catch {
        // non-fatal fallback
      }
    }

    const result = await saveBookRecord({
      title:      row.title,
      author:     row.author,
      department: row.department,
      category:   row.category,
      language:   row.language,
      summary:    row.summary ?? "",
      isbn:       row.isbn ?? "",
      year:       row.year ?? "",
      pages,
      tags:       row.keywords ?? "",
      fileUrl:    pdfPublicUrl,
      fileSizeKb: String(Math.round(pdfFile.size / 1024)),
      coverUrl:   coverUrl ?? "",
      contentHash: contentHash ?? "",
    });
    if (result && "error" in result) throw new Error(result.error);

    // `result` is a discriminated union; the error branch is thrown above, so
    // the success branch's slug is reachable without an `as any` cast — which
    // is all the file-level no-explicit-any suppression was hiding here.
    onStatus("done", { slug: result && "slug" in result ? result.slug : undefined });
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

/* Row status on the status triplets rather than six raw Tailwind ramps
   (slate/blue/cyan/amber/emerald/red). The three in-flight states share one
   "working" tone on purpose — which byte is currently moving is not something
   the operator can act on, and a hue each made a running batch read as six
   kinds of outcome. The spinner carries the in-flight signal. */
const STATUS_META: Record<RowStatus, { cls: string }> = {
  pending:           { cls: "border border-divider bg-paper text-text-muted" },
  "uploading-pdf":   { cls: "border border-info-line bg-info-soft text-info-text" },
  "uploading-cover": { cls: "border border-info-line bg-info-soft text-info-text" },
  saving:            { cls: "border border-info-line bg-info-soft text-info-text" },
  done:              { cls: "border border-success-line bg-success-soft text-success-text" },
  error:             { cls: "border border-danger-line bg-danger-soft text-danger-text" },
};

function StatusBadge({ status }: { status: RowStatus }) {
  const t = useTranslations("adminUpload.bulk.rowStatus");
  const { cls } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {(status === "uploading-pdf" || status === "uploading-cover" || status === "saving") && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
      )}
      {t(status)}
    </span>
  );
}

/**
 * File-picker tile for the three folder inputs.
 *
 * Declared at module scope, not inside BulkUploadForm's render: a component
 * defined during render is a new type on every pass, so React unmounts and
 * remounts its subtree each time — which is what the react-hooks lint rule was
 * reporting here. Nothing in it is stateful today, so the bug was latent, but
 * the remount cost was real on every re-render of a 500-row batch.
 */
function DropZoneDisplay({
  ready,
  readyLabel,
  idleLabel,
  icon,
  checkedIcon,
}: {
  ready: boolean;
  readyLabel: string;
  idleLabel: string;
  icon: React.ReactNode;
  checkedIcon: React.ReactNode;
}) {
  return (
    <div
      className={`flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors duration-150 ${
        ready
          ? "border-success-line bg-success-soft text-success-text"
          : "border-divider bg-paper text-text-muted hover:border-border-strong"
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          ready ? "bg-bg-surface" : "bg-surface-brand-soft"
        }`}
        aria-hidden="true"
      >
        {ready ? checkedIcon : icon}
      </span>
      <span className="text-xs font-semibold">{ready ? readyLabel : idleLabel}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function BulkUploadForm() {

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
  const t = useTranslations("adminUpload.bulk");
  const done    = jobs.filter((j) => j.status === "done").length;
  const errors  = jobs.filter((j) => j.status === "error").length;
  const missing = jobs.filter((j) => j.status === "pending" && !j.pdfFile).length;

  const csvReady   = csvRows.length > 0;
  const pdfReady   = pdfIndex.size > 0;
  const canPreview = csvReady && pdfReady;
  const canStart   = canPreview && jobs.length > 0 && !running;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Step 1: CSV template ── */}
      <FormSection
        title={t("step1")}
        description={t.rich("step1Sub", {
          code: (c) => <code className="rounded bg-paper px-1 py-0.5 font-mono">{c}</code>,
        })}
      >
        <div>
          <div className="overflow-x-auto rounded-xl border border-divider bg-paper">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-divider bg-bg-surface">
                  {["title*","author*","category*","department*","language*","pdf_file*","cover_file","keywords","isbn","year","pages","summary"].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-text-muted">{h}</th>
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
          <p className="mt-2.5 text-xs text-text-muted">
            {t.rich("requiredNote", {
              star: (c) => <span className="text-danger">{c}</span>,
              code: (c) => <code className="font-mono">{c}</code>,
            })}
          </p>
        </div>
      </FormSection>

      {/* ── Step 2: Select files ── */}
      <FormSection title={t("step2")} description={t("step2Sub")}>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* CSV */}
            <label className="flex flex-col gap-2 cursor-pointer">
              <span className="mb-1.5 block text-sm font-medium text-text-body">
                CSV file
                <span className="ms-0.5 font-normal text-danger" aria-hidden="true">*</span>
              </span>
              <DropZoneDisplay
                ready={csvReady}
                readyLabel={t("csvReady", { count: csvRows.length })}
                idleLabel={t("selectCsv")}
                icon={<FileSpreadsheet className="h-4 w-4 text-brand" />}
                checkedIcon={<CheckCircle className="h-4 w-4 text-success" />}
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
              <span className="mb-1.5 block text-sm font-medium text-text-body">
                PDF files
                <span className="ms-0.5 font-normal text-danger" aria-hidden="true">*</span>
              </span>
              <DropZoneDisplay
                ready={pdfReady}
                readyLabel={t("pdfReady", { count: pdfIndex.size })}
                idleLabel={t("selectPdfs")}
                icon={<FileText className="h-4 w-4 text-brand" />}
                checkedIcon={<CheckCircle className="h-4 w-4 text-success" />}
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
              <span className="mb-1.5 block text-sm font-medium text-text-body">Cover files</span>
              <DropZoneDisplay
                ready={coverIndex.size > 0}
                readyLabel={t("coversReady", { count: coverIndex.size })}
                idleLabel={t("selectCovers")}
                icon={<ImageIcon className="h-4 w-4 text-brand" />}
                checkedIcon={<CheckCircle className="h-4 w-4 text-success" />}
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
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm text-danger-text">{parseError}</p>
            </div>
          )}

          {canPreview && !started && (
            <button type="button" onClick={handlePreview} className={BTN_SECONDARY}>
              {t("preview")}
            </button>
          )}
        </div>
      </FormSection>

      {/* ── Step 3: Review & Upload ── */}
      {jobs.length > 0 && (
        <div className="form-card-accent overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-divider bg-paper px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-heading">{t("step3")}</h3>
              <p className="mt-0.5 text-xs text-text-muted">
                {t("summary", { total, done, errors })}
                {missing > 0 && (
                  <span className="text-warning-text"> · {t("pdfMissing", { count: missing })}</span>
                )}
              </p>
            </div>

            {/* Genuinely determinate, unlike the single upload's phase stepper:
                the queue knows how many rows have finished. */}
            {started && total > 0 && (
              <div
                className="flex shrink-0 items-center gap-3"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done + errors}
                aria-label={t("step3")}
              >
                <div className="h-2 w-36 overflow-hidden rounded-full bg-paper ring-1 ring-divider">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      errors > 0 ? "bg-warning" : "bg-success"
                    }`}
                    style={{ width: `${((done + errors) / total) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums text-text-body">
                  {Math.round(((done + errors) / total) * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-divider bg-paper/70 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                  <th scope="col" className="px-4 py-2.5 text-left">#</th>
                  <th scope="col" className="px-4 py-2.5 text-left">{t("col.title")}</th>
                  <th scope="col" className="px-4 py-2.5 text-left">{t("col.author")}</th>
                  <th scope="col" className="px-4 py-2.5 text-left">{t("col.pdf")}</th>
                  <th scope="col" className="px-4 py-2.5 text-left">{t("col.cover")}</th>
                  <th scope="col" className="px-4 py-2.5 text-left">{t("col.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {jobs.map((job, i) => (
                  <tr
                    key={job.id}
                    className={`transition-colors duration-150 ${
                      job.status === "done"
                        ? "bg-success-soft/40"
                        : job.status === "error"
                          ? "bg-danger-soft/40"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-xs text-text-muted">{i + 1}</td>
                    <td className="max-w-[200px] px-4 py-3">
                      <p className="truncate text-sm font-medium text-text-body">{job.row.title}</p>
                      <p className="truncate text-xs text-text-muted">{job.row.category} · {job.row.department}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">{job.row.author}</td>
                    <td className="px-4 py-3">
                      {job.pdfFile ? (
                        <span className="text-xs font-medium text-success-text">✓ {job.row.pdf_file}</span>
                      ) : (
                        <span className="text-xs font-semibold text-danger-text">✗ {job.row.pdf_file}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {job.row.cover_file
                        ? job.coverFile
                          ? <span className="text-success-text">✓ {job.row.cover_file}</span>
                          : <span className="text-warning-text">✗ {job.row.cover_file}</span>
                        : <span className="text-text-muted">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={job.status} />
                        {job.error && <p className="text-xs text-danger-text">{job.error}</p>}
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
          <div className="flex flex-wrap items-center gap-3 border-t border-divider px-5 py-4 sm:px-6">
            {!started ? (
              <>
                {missing > 0 && (
                  <p className="text-xs text-warning-text">
                    {t("missingSkipped", { count: missing })}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!canStart}
                  className={`${BTN_PRIMARY} ml-auto`}
                >
                  <UploadIcon className="h-4 w-4" aria-hidden="true" />
                  {t("startUpload", { count: jobs.filter((j) => j.pdfFile).length })}
                </button>
              </>
            ) : running ? (
              <div
                className="flex items-center gap-2 text-sm text-text-muted"
                role="status"
                aria-live="polite"
              >
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {t("uploadingParallel", { count: concurrency })}
              </div>
            ) : (
              <div className="flex w-full flex-wrap items-center gap-3" role="status" aria-live="polite">
                <p className="text-sm font-semibold text-success-text">
                  {t("completed", { done })}
                  {errors > 0 ? t("completedFailed", { errors }) : ""}
                </p>
                {errors > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const retryJobs = jobs.filter((j) => j.status === "error");
                      setRunning(true);
                      runQueue(retryJobs, concurrency, updateJob).then(() => setRunning(false));
                    }}
                    className={BTN_SECONDARY}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("retryFailed", { errors })}
                  </button>
                )}
                {/* A finished batch otherwise has nowhere to go. The single
                    upload lands on the collection; this offers the same exit
                    rather than leaving the operator on a spent form. */}
                {done > 0 && (
                  <Link href={EBOOKS_BASE_PATH} className={`${BTN_PRIMARY} ml-auto`}>
                    {t("viewCollection")}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
