"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useCallback, useEffect } from "react";
import { saveBookRecord } from "@/app/(admin)/admin/(protected)/books/actions";
import { deleteZimaFile } from "@/app/actions/upload";
import {
  startImportRun,
  saveImportRunProgress,
  getResumableImportRun,
  closeImportRun,
  type ImportRun,
  type ImportRunRow,
} from "@/app/(admin)/admin/(protected)/books/upload/import-run-actions";
import { makeUid, bookFolder } from "@/lib/book-utils";
import { describeStoragePathError, folderNameNote, type FolderNameNote } from "@/lib/storage/folder-name";
import { QueueCancelled, postFile, type QueueGate } from "@/lib/admin/import-queue";
import { getPdfPageCount } from "@/lib/pdf-client-utils";
import { FormSection, BTN_PRIMARY, BTN_SECONDARY } from "@/components/admin/kit/form";
import { EBOOKS_BASE_PATH } from "@/lib/admin/ebooks-url";
import Link from "next/link";
import {
  FileSpreadsheet, Image as ImageIcon, Upload as UploadIcon,
  CheckCircle, AlertCircle, RotateCcw, FileText, Timer, Square, History,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RowStatus =
  | "pending"
  | "uploading-pdf"
  | "uploading-cover"
  | "saving"
  | "done"
  | "skipped"
  | "error";

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
  /** Destination folder, decided when the job is built rather than when it
   *  runs, so Step 3 can show and validate it BEFORE anything is sent — and so
   *  a retry lands in the same place instead of minting a second folder. */
  folder: string;
  /** Whether the title fit the storage segment, was cut, or fell back. */
  folderNote: FolderNameNote;
  /** Non-fatal problem on an otherwise successful row (e.g. cover rejected). */
  warning?: string;
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

/** Lower-cased cover extension, defaulting the way bookCoverPath() did. */
function coverExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext : "jpg";
}

// ─── Upload a single book ─────────────────────────────────────────────────────

async function uploadBook(
  job: BookJob,
  gate: QueueGate,
  onStatus: (status: RowStatus, extra?: { error?: string; slug?: string; warning?: string }) => void,
  onTransport: (via: "v1" | "legacy") => void,
): Promise<void> {
  const { row, pdfFile, coverFile } = job;

  if (!pdfFile) { onStatus("error", { error: `PDF not found: "${row.pdf_file}"` }); return; }

  // Refuse locally what storage would refuse remotely, so a bad row costs
  // nothing rather than a full PDF upload followed by a 400.
  const folderProblem = describeStoragePathError(job.folder);
  if (folderProblem) { onStatus("error", { error: folderProblem }); return; }

  let uploadedPdfUrl: string | null = null;
  try {
    // 1. PDF and cover in ONE request. Zima meters per request, not per file,
    //    so a book now costs one unit instead of two — see the route's header
    //    comment and docs/BULK-IMPORT.md.
    onStatus("uploading-pdf");
    const folder = job.folder;

    const payload = new FormData();
    payload.set("folder", folder);
    payload.set("pdf", pdfFile);
    payload.set("pdfName", "book.pdf");
    if (coverFile) {
      payload.set("cover", coverFile);
      payload.set("coverName", `cover.${coverExt(coverFile.name)}`);
      payload.set("coverType", coverFile.type || "image/jpeg");
    }

    const pdfRes = await postFile("/api/admin/bulk-upload", {
      method: "POST",
      body: payload,
    }, gate);
    if (!pdfRes.ok) {
      const { error } = await pdfRes.json().catch(() => ({ error: pdfRes.statusText }));
      // 409 means this exact PDF is already in the library — the content-hash
      // check in /api/admin/bulk-upload. That is the expected outcome of
      // re-running a CSV after a partial failure, so it is reported as a skip,
      // not as something the operator has to investigate. It is also what
      // makes a re-run safe: the rows that succeeded cannot be duplicated.
      if (pdfRes.status === 409) { onStatus("skipped", { error }); return; }
      throw new Error(`PDF upload failed: ${error}`);
    }
    const { url: pdfPublicUrl, coverUrl, contentHash, via, warning } = await pdfRes.json();
    uploadedPdfUrl = pdfPublicUrl;
    onTransport(via === "legacy" ? "legacy" : "v1");

    // 3. Save record
    onStatus("saving");

    // Auto-detect pages from PDF if not specified in CSV row
    let pages = (row.pages ?? "").trim();
    // pdfFile is already guaranteed non-null here (line 103's early return).
    if (!pages) {
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
      // Recorded so a later title edit cannot send the app looking for a
      // folder that was never created (migration 0128).
      storageFolder: folder,
    });
    if (result && "error" in result) throw new Error(result.error);
    uploadedPdfUrl = null; // committed — the row now owns the file

    // `result` is a discriminated union; the error branch is thrown above, so
    // the success branch's slug is reachable without an `as any` cast — which
    // is all the file-level no-explicit-any suppression was hiding here.
    onStatus("done", {
      slug: result && "slug" in result ? result.slug : undefined,
      // A book saved without its cover is a success WITH a caveat. Showing it
      // on the row is the difference between "no cover" and "no cover, and
      // nobody was told".
      warning: warning ?? undefined,
    });
  } catch (err) {
    // A PDF that reached storage but never reached a book row is an orphan:
    // invisible in the catalogue, still occupying the disk, and — because the
    // duplicate check is by content hash — enough to make the retry of this
    // very row fail with 409. Give the bytes back before reporting.
    if (uploadedPdfUrl) {
      await deleteZimaFile(uploadedPdfUrl).catch(() => {});
    }
    // Stopping is not a row failure: leave the row pending so Start resumes it.
    if (err instanceof QueueCancelled) throw err;
    onStatus("error", { error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// ─── Parallel queue runner ────────────────────────────────────────────────────

async function runQueue(
  jobs: BookJob[],
  concurrency: number,
  gate: QueueGate,
  onJobUpdate: (id: string, status: RowStatus, extra?: { error?: string; slug?: string; warning?: string }) => void,
  onTransport: (via: "v1" | "legacy") => void,
) {
  let i = 0;

  async function next(): Promise<void> {
    if (gate.cancelled) return;
    const idx = i++;
    if (idx >= jobs.length) return;
    const job = jobs[idx];
    try {
      await uploadBook(job, gate, (status, extra) => onJobUpdate(job.id, status, extra), onTransport);
    } catch (err) {
      if (err instanceof QueueCancelled) return; // drain quietly
      throw err;
    }
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
  // A row already in the library is an outcome, not a failure — it reads as a
  // neutral note so a re-run of a partly-failed CSV does not look like a batch
  // of 60 errors.
  skipped:           { cls: "border border-divider bg-paper text-text-muted" },
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

  // Concurrency. Two, not four: Zima's quota is 60 uploads per HOUR shared
  // across the whole app, so parallelism buys nothing but a faster way to
  // exhaust it — and four workers meant four rows burned per 429 instead of
  // one. Two keeps the pipe busy while the server is healthy.
  const [concurrency] = useState(2);

  // Rate-limit pause, surfaced as a countdown.
  // Only the deadline is state. The server's own wording ("Too many
  // requests…") is English-only and says nothing the translated hint does not,
  // so the gate still reports a reason for future logging but the UI does not
  // render it into a Khmer page.
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const gateRef = useRef<QueueGate | null>(null);

  // Durable progress (migration 0129).
  const [resumable, setResumable] = useState<ImportRun | null>(null);
  // Which storage endpoint the run actually reached. Reported POSITIVELY, not
  // only on failure: "am I getting 120/hour or silently falling back to 60?"
  // must be answerable at a glance, and the absence of a warning is not an
  // answer. "legacy" wins once seen — a run that fell back even once did not
  // get the batched rate.
  const [transport, setTransport] = useState<"v1" | "legacy" | null>(null);
  const [resumedRows, setResumedRows] = useState<Map<string, ImportRunRow>>(new Map());
  const runIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const csvLabel = useRef<string>("import.csv");

  // Tick only while a pause is actually pending — a permanent 1 Hz re-render
  // of a 500-row table is not worth a clock nobody is looking at.
  useEffect(() => {
    if (pausedUntil === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pausedUntil]);

  // Offer to pick up an interrupted run. Fails silently: progress persistence
  // must never stand between an operator and a fresh import.
  useEffect(() => {
    let live = true;
    getResumableImportRun()
      .then((run) => { if (live && run) setResumable(run); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────

  function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    csvLabel.current = file.name;
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
  // `previous` lets a rebuild keep the folder a row was already assigned, so
  // picking more PDF files after previewing re-matches the files without
  // moving anybody's destination.
  const buildJobs = useCallback((previous: BookJob[] = []): BookJob[] => {
    const keptFolders = new Map(previous.map((j) => [j.id, j.folder] as const));
    return csvRows.map((row, i) => {
      const id = String(i);
      const uid = makeUid();
      // A resumed run contributes the row's outcome and its folder — but only
      // when the title still matches, so a different CSV loaded into a stale
      // run cannot inherit another book's destination.
      const prior = resumedRows.get(id);
      const priorApplies = prior !== undefined && prior.title === row.title;
      return {
        id,
        row,
        pdfFile:   pdfIndex.get(row.pdf_file.toLowerCase()) ?? null,
        coverFile: row.cover_file ? (coverIndex.get(row.cover_file.toLowerCase()) ?? null) : null,
        status:    (priorApplies ? (prior.status as RowStatus) : "pending"),
        error:     priorApplies ? prior.error : undefined,
        slug:      priorApplies ? prior.slug : undefined,
        folder:
          keptFolders.get(id) ??
          (priorApplies && prior.folder ? prior.folder : bookFolder(row.category || "uncategorized", row.title, uid)),
        folderNote: folderNameNote(row.title, uid),
      };
    });
  }, [csvRows, pdfIndex, coverIndex, resumedRows]);

  function handlePreview() {
    setJobs(buildJobs(jobs));
    setStarted(false);
  }

  function updateJob(
    id: string,
    status: RowStatus,
    extra?: { error?: string; slug?: string; warning?: string },
  ) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? { ...j, status, error: extra?.error, slug: extra?.slug, warning: extra?.warning }
          : j,
      ),
    );
  }

  /** Persist the queue, coalesced — one write per second at most. */
  const persist = useCallback(
    (rows: BookJob[], status: ImportRun["status"]) => {
      const id = runIdRef.current;
      if (!id) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const snapshot: ImportRunRow[] = rows.map((j) => ({
        id: j.id,
        title: j.row.title,
        pdfName: j.row.pdf_file,
        folder: j.folder,
        status: j.status,
        error: j.error,
        slug: j.slug,
      }));
      saveTimer.current = setTimeout(() => {
        saveImportRunProgress(id, snapshot, status).catch(() => {});
      }, 1000);
    },
    [],
  );

  /** Build the gate the workers share, wiring its pauses to the countdown. */
  function makeGate(): QueueGate {
    const gate: QueueGate = {
      pausedUntil: 0,
      cancelled: false,
      onPause: (until) => {
        setPausedUntil(until);
        setNow(Date.now());
      },
      onResume: () => setPausedUntil(null),
    };
    gateRef.current = gate;
    return gate;
  }

  async function runJobs(queue: BookJob[], all: BookJob[]) {
    const gate = makeGate();
    setRunning(true);
    let latest = all;
    try {
      await runQueue(queue, concurrency, gate, (id, status, extra) => {
        updateJob(id, status, extra);
        latest = latest.map((j) => (j.id === id ? { ...j, status, error: extra?.error, slug: extra?.slug } : j));
        persist(latest, gate.cancelled ? "paused" : "running");
      }, (via) => setTransport((prev) => (prev === "legacy" ? prev : via)));
    } finally {
      setRunning(false);
      setPausedUntil(null);
      gateRef.current = null;
      const finished = latest.every((j) => j.status === "done" || j.status === "skipped");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const id = runIdRef.current;
      if (id) {
        const snapshot: ImportRunRow[] = latest.map((j) => ({
          id: j.id, title: j.row.title, pdfName: j.row.pdf_file, folder: j.folder,
          status: j.status, error: j.error, slug: j.slug,
        }));
        await saveImportRunProgress(id, snapshot, finished ? "completed" : "paused").catch(() => {});
        if (finished) {
          await closeImportRun(id, "completed").catch(() => {});
          runIdRef.current = null;
        }
      }
    }
  }

  async function handleStart() {
    // Rebuild so a file picked after the preview is still matched, but carry
    // each row's folder across: it is what Step 3 showed the operator, and
    // re-minting it would upload somewhere other than the reviewed destination.
    const built = buildJobs(jobs);
    setJobs(built);
    setStarted(true);

    // A row already finished in a resumed run is not re-uploaded.
    const queue = built.filter((j) => j.status !== "done" && j.status !== "skipped");

    if (!runIdRef.current) {
      const started = await startImportRun(
        csvLabel.current,
        built.map((j) => ({
          id: j.id, title: j.row.title, pdfName: j.row.pdf_file,
          folder: j.folder, status: j.status, error: j.error, slug: j.slug,
        })),
      );
      if ("runId" in started) runIdRef.current = started.runId;
      // No runId means progress will not survive a refresh; the import itself
      // is unaffected, so this is not worth blocking on.
    }

    await runJobs(queue, built);
  }

  function handleStop() {
    if (gateRef.current) gateRef.current.cancelled = true;
  }

  /** Adopt a persisted run: its outcomes, not its files. */
  function handleResume(run: ImportRun) {
    runIdRef.current = run.id;
    setResumedRows(new Map(run.rows.map((r) => [r.id, r])));
    setResumable(null);
    setJobs([]);
    setStarted(false);
  }

  async function handleDiscardRun(run: ImportRun) {
    setResumable(null);
    await closeImportRun(run.id, "abandoned").catch(() => {});
  }

  // ── Derived stats ──────────────────────────────────────────────

  const total   = jobs.length;
  const t = useTranslations("adminUpload.bulk");
  const done    = jobs.filter((j) => j.status === "done").length;
  const errors  = jobs.filter((j) => j.status === "error").length;
  const skipped = jobs.filter((j) => j.status === "skipped").length;
  const missing = jobs.filter((j) => j.status === "pending" && !j.pdfFile).length;
  // Pre-flight: every folder is clamped by bookFolder(), so this should stay
  // empty — it is here because a row that storage will refuse must be visible
  // in Step 3 rather than discovered one failed upload at a time.
  // Rows left after a stop or a partial run — the queue was interrupted, not
  // failed, so they need their own way back in.
  const remaining = started
    ? jobs.filter((j) => j.status === "pending" && j.pdfFile).length
    : 0;
  const badFolders = jobs.filter((j) => describeStoragePathError(j.folder) !== null).length;
  const truncated  = jobs.filter((j) => j.folderNote === "truncated").length;
  // Not a problem, but the answer to "why is there a folder called book-d4rwjf?"
  const fallbacks  = jobs.filter((j) => j.folderNote === "fallback").length;

  const csvReady   = csvRows.length > 0;
  const pdfReady   = pdfIndex.size > 0;
  const canPreview = csvReady && pdfReady;
  const canStart   = canPreview && jobs.length > 0 && !running;

  // ─── Render ──────────────────────────────────────────────────────────────────

  const pauseSecondsLeft = pausedUntil ? Math.max(0, Math.ceil((pausedUntil - now) / 1000)) : 0;
  const pauseClock = `${Math.floor(pauseSecondsLeft / 60)}:${String(pauseSecondsLeft % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-5">

      {/* ── Resume an interrupted run ──
          Zima's hourly quota means a large import is paused for tens of
          minutes at a time; without this, a refresh during that wait threw
          away the record of which rows had already landed. */}
      {resumable && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-info-line bg-info-soft px-5 py-4">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-info-text">
              {t("resumeTitle", {
                label: resumable.label ?? "import.csv",
                done: resumable.rows.filter((r) => r.status === "done" || r.status === "skipped").length,
                total: resumable.total,
              })}
            </p>
            <p className="mt-0.5 text-xs text-info-text/80">{t("resumeHint")}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => handleResume(resumable)} className={BTN_SECONDARY}>
              {t("resumeAction")}
            </button>
            <button
              type="button"
              onClick={() => void handleDiscardRun(resumable)}
              className="text-xs font-semibold text-text-muted underline underline-offset-2"
            >
              {t("resumeDiscard")}
            </button>
          </div>
        </div>
      )}

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
                aria-valuenow={done + errors + skipped}
                aria-label={t("step3")}
              >
                <div className="h-2 w-36 overflow-hidden rounded-full bg-paper ring-1 ring-divider">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      errors > 0 ? "bg-warning" : "bg-success"
                    }`}
                    style={{ width: `${((done + errors + skipped) / total) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums text-text-body">
                  {Math.round(((done + errors + skipped) / total) * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Rate-limit state. Zima's quota is measured in an HOUR, so this is
              not a spinner with a long tail — it is a real wait the operator
              must be able to see, leave, and come back to. */}
          {pausedUntil !== null && (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-wrap items-center gap-3 border-b border-warning-line bg-warning-soft px-5 py-3 sm:px-6"
            >
              <Timer className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-xs text-warning-text">
                <span className="font-semibold">{t("rateLimited", { clock: pauseClock })}</span>
                <span className="ml-1 opacity-80">{t("rateLimitedHint")}</span>
              </p>
            </div>
          )}

          {/* WHICH PATH THIS RUN USED, shown either way. The question being
              answered is "am I really getting 120/hour?", and silence cannot
              answer it — a fallback and a fast run would look identical. */}
          {transport !== null && (
            <p
              role="status"
              className={`flex items-start gap-2 border-b px-5 py-3 text-xs sm:px-6 ${
                transport === "v1"
                  ? "border-divider text-text-muted"
                  : "border-warning-line bg-warning-soft text-warning-text"
              }`}
            >
              {transport === "v1" ? (
                <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {transport === "v1" ? t("transportBatched") : t("legacyUploadPath")}
            </p>
          )}

          {/* Pre-flight notices. Shown before the batch runs, because "14 of the
              first 36 rows failed" is a discovery an operator should never make
              one upload at a time. */}
          {!started && (badFolders > 0 || truncated > 0 || fallbacks > 0) && (
            <div className="space-y-2 border-b border-divider px-5 py-3 sm:px-6">
              {badFolders > 0 && (
                <p role="alert" className="flex items-start gap-2 text-xs text-danger-text">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t("folderInvalid", { count: badFolders })}
                </p>
              )}
              {truncated > 0 && (
                <p className="flex items-start gap-2 text-xs text-text-muted">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t("folderTruncated", { count: truncated })}
                </p>
              )}
              {fallbacks > 0 && (
                <p className="flex items-start gap-2 text-xs text-text-muted">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t("folderFallback", { count: fallbacks })}
                </p>
              )}
            </div>
          )}

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
                      {(() => {
                        const problem = describeStoragePathError(job.folder);
                        if (problem) {
                          return <p className="mt-0.5 text-xs font-medium text-danger-text">{problem}</p>;
                        }
                        if (job.folderNote !== "exact") {
                          return (
                            <p className="mt-0.5 truncate font-mono text-[11px] text-text-muted" title={job.folder}>
                              {t("folderIs", { folder: job.folder })}
                            </p>
                          );
                        }
                        return null;
                      })()}
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
                        {job.warning && <p className="text-xs text-warning-text">{job.warning}</p>}
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
              <div className="flex w-full flex-wrap items-center gap-3">
                <div
                  className="flex items-center gap-2 text-sm text-text-muted"
                  role="status"
                  aria-live="polite"
                >
                  {pausedUntil !== null ? (
                    <Timer className="h-4 w-4 text-warning" aria-hidden="true" />
                  ) : (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )}
                  {pausedUntil !== null
                    ? t("rateLimited", { clock: pauseClock })
                    : t("uploadingParallel", { count: concurrency })}
                </div>
                {/* An hour-long automatic wait has to be escapable. Stopping
                    leaves finished rows finished and the run resumable. */}
                <button type="button" onClick={handleStop} className={`${BTN_SECONDARY} ml-auto`}>
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("stop")}
                </button>
              </div>
            ) : (
              <div className="flex w-full flex-wrap items-center gap-3" role="status" aria-live="polite">
                <p className="text-sm font-semibold text-success-text">
                  {t("completed", { done })}
                  {errors > 0 ? t("completedFailed", { errors }) : ""}
                  {skipped > 0 ? t("completedSkipped", { skipped }) : ""}
                </p>
                {errors > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const retryJobs = jobs.filter((j) => j.status === "error");
                      void runJobs(retryJobs, jobs);
                    }}
                    className={BTN_SECONDARY}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("retryFailed", { errors })}
                  </button>
                )}
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const rest = jobs.filter((j) => j.status === "pending" && j.pdfFile);
                      void runJobs(rest, jobs);
                    }}
                    className={BTN_SECONDARY}
                  >
                    <UploadIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("continueRemaining", { count: remaining })}
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
