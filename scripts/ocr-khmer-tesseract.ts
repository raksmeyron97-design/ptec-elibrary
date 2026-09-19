/* scripts/ocr-khmer-tesseract.ts
 *
 * Self-hosted Khmer OCR for books whose PDF text layer cannot be repaired.
 *
 *   npx tsx scripts/ocr-khmer-tesseract.ts --check-env
 *   npx tsx scripts/ocr-khmer-tesseract.ts --slug "<slug>" --dry-run
 *   npx tsx scripts/ocr-khmer-tesseract.ts --limit 5 --dry-run
 *   npx tsx scripts/ocr-khmer-tesseract.ts --slug "<slug>" --apply
 *   npx tsx scripts/ocr-khmer-tesseract.ts --limit 5 --apply
 *
 * Recognition is `tesseract` reading a PNG on this machine. **No OCR API is
 * called and nothing is billed per page** — see `--check-env`, which prints
 * every network host the process contacted, and lib/ocr/egress.ts, which
 * refuses a request to a hosted inference endpoint rather than reporting one
 * after the money is spent.
 *
 * ── DRY RUN IS THE DEFAULT ──────────────────────────────────────────────────
 *
 * Without `--apply` nothing is written: not `book_pages`, not
 * `resource_index_state`, not `book_chunks`. A dry run reads three pages of
 * one book and shows you the Khmer it produced, which is the only thing that
 * can tell you whether this is worth running over a library.
 *
 * ── Where this sits ─────────────────────────────────────────────────────────
 *
 * It is a RECOVERY path, not a replacement for extraction. `lib/pdf-page-index
 * .ts` (pdf.js) remains how every healthy PDF is read, and
 * `lib/text/khmer-reassemble.ts` remains how fragmented-but-complete Khmer is
 * repaired — deterministically, at no cost, without inventing a code point.
 * OCR is for the two things neither can do: a page whose text stream is empty
 * because the page is an image, and a page whose characters are WRONG because
 * a legacy font mapped its glyphs through Latin. In both cases the only place
 * the text still exists is the rendered page.
 *
 *     PDF → pdftoppm → (preprocess) → tesseract khm → normalize
 *         → khmer-reassemble → analyzeTextHealth → book_pages
 *
 * Every stage of that chain is timed and reported per page, because the
 * question an operator has is never "did it run" but "is the Khmer right".
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  budgetedBatches,
  deleteRecordPages,
  insertBatch,
  resolvePdfUrl,
} from "../lib/pdf-page-index";
import { toAllowedStorageUrl } from "../lib/zima";
import { describeTarget, judgeEnvironment } from "../lib/indexing/environment";
import { sourceDigest, writeIndexState } from "../lib/indexing/state";
import { OcrError, isOcrError, type OcrErrorCode } from "../lib/ocr/errors";
import { EgressRecorder } from "../lib/ocr/egress";
import {
  DEFAULT_DPI,
  DEFAULT_LANG,
  DEFAULT_PSM,
  pdfPageCount,
  preprocessImage,
  probeOcrEnvironment,
  recognizePage,
  renderPdfPage,
  type PreprocessMode,
} from "../lib/ocr/tesseract";
import {
  canSkipBeforeOcr,
  decideRecordWrite,
  isStorablePage,
  postProcessOcrPage,
  sampleForHealth,
} from "../lib/ocr/text";
import type { TextHealth } from "../lib/semantic/text-quality";

// ── CLI ─────────────────────────────────────────────────────────────────────

const ARGV = process.argv.slice(2);
const has = (flag: string) => ARGV.includes(flag);
const valueOf = (flag: string): string | undefined => {
  const i = ARGV.indexOf(flag);
  return i >= 0 && i + 1 < ARGV.length ? ARGV[i + 1] : undefined;
};
const numberOf = (flag: string, fallback: number): number => {
  const raw = valueOf(flag);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const CHECK_ENV = has("--check-env");
const APPLY = has("--apply");
const FORCE = has("--force");
const AS_JSON = has("--json");
const VERBOSE = has("--verbose");
const KEEP_IMAGES = has("--keep-images");
const SLUG = valueOf("--slug");
const LIMIT = numberOf("--limit", 0);
const PAGE_START = numberOf("--page-start", 1);
const PAGE_END = numberOf("--page-end", 0);
const DPI = numberOf("--dpi", DEFAULT_DPI);
const PSM = numberOf("--psm", DEFAULT_PSM);
const LANG = valueOf("--lang") ?? DEFAULT_LANG;
const PREPROCESS = (valueOf("--preprocess") ?? "none") as PreprocessMode;
const QUEUE_PATH = path.resolve(
  valueOf("--queue") ?? process.env.OCR_QUEUE_PATH ?? path.join(__dirname, "scanned-books-queue.json"),
);
const OUTPUT_DIR = valueOf("--output-dir") ?? process.env.OCR_WORK_DIR ?? null;
/**
 * Take only queue entries carrying this candidate reason.
 *
 * The queue mixes classes that behave nothing alike. A `no-text-layer` book
 * holds no text, so OCR can only add; a `khmer-legacy-font` book holds text
 * that OCR REPLACES, and replacing it is a judgement call per book — the
 * chemistry lab manual whose formulas OCR degraded is why. Filtering by reason
 * lets an operator run the safe class unattended and keep the rest for review,
 * off the one committed queue file rather than a hand-made copy of it.
 */
const REASON = valueOf("--reason") ?? null;

/**
 * Pages a dry run reads when no explicit range was given.
 *
 * Three is enough to see whether the Khmer is right and short enough that an
 * operator will actually run it before committing to a library.
 */
const DRY_RUN_PAGES = 3;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ── Reporting ───────────────────────────────────────────────────────────────

type PageOutcome = {
  pageNo: number;
  renderMs: number;
  ocrMs: number;
  chars: number;
  khmerRatio: number;
  verdict: TextHealth["verdict"];
  reasons: string[];
  reassembled: boolean;
  content: string;
  stored: boolean;
};

type BookOutcome = {
  slug: string | null;
  title: string;
  id: string;
  status: "ocr-written" | "dry-run" | "skipped" | "failed";
  code?: OcrErrorCode | "EXISTING_TEXT_HEALTHY" | "OCR_EMPTY" | "TEXT_HEALTH_FAILED";
  detail?: string;
  pdfPages: number;
  pagesProcessed: number;
  pagesStored: number;
  elapsedMs: number;
  health?: TextHealth;
  pages: PageOutcome[];
};

function log(...args: unknown[]) {
  if (!AS_JSON) console.log(...args);
}

// ── Work directory ──────────────────────────────────────────────────────────

/**
 * Where rendered page images live while they are being read.
 *
 * `OCR_WORK_DIR` in the container is a mounted volume, not the writable layer:
 * a 500-page book at 300 DPI is several gigabytes of PNG passing through, and
 * a container that fills its own layer dies in a way that looks like a bug in
 * the OCR rather than a bug in the plumbing. Locally it falls back to the OS
 * temp directory, which is correct there — a laptop run is short-lived and
 * `--keep-images` is the flag for when you want to look at the rasters.
 */
async function makeWorkDir(): Promise<string> {
  const base = OUTPUT_DIR ?? os.tmpdir();
  await fsp.mkdir(base, { recursive: true });
  return fsp.mkdtemp(path.join(base, "ptec-ocr-"));
}

// ── Database ────────────────────────────────────────────────────────────────

type TargetBook = { id: string; slug: string | null; title: string; fileUrl: string | null };

async function fetchBookBySlug(db: SupabaseClient, slug: string): Promise<TargetBook> {
  const { data, error } = await db
    .from("books")
    .select("id, slug, title, book_files(file_url)")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new OcrError("BOOK_NOT_FOUND", `books lookup failed: ${error.message}`);
  if (!data) throw new OcrError("BOOK_NOT_FOUND", `No book with slug "${slug}".`);
  const files = (data.book_files ?? []) as Array<{ file_url: string | null }>;
  return {
    id: data.id as string,
    slug: (data.slug as string | null) ?? null,
    title: (data.title as string) ?? "",
    fileUrl: files.map((f) => f.file_url).find((u): u is string => !!u) ?? null,
  };
}

/**
 * Ids per `in(...)` lookup.
 *
 * PostgREST filters travel in the QUERY STRING, so `in.(id1,id2,…)` grows the
 * URL by ~37 characters per uuid and the server answers `414 URI too long`
 * well before a full queue fits. Measured: 218 ids is far over the line, 3 is
 * fine — which is exactly the shape of bug that passes every small test and
 * fails on the first real batch, so the batching is here rather than in the
 * caller's head.
 */
const ID_LOOKUP_CHUNK = 50;

async function fetchBooksById(db: SupabaseClient, ids: readonly string[]): Promise<TargetBook[]> {
  if (ids.length === 0) return [];

  const byId = new Map<string, TargetBook>();
  for (let from = 0; from < ids.length; from += ID_LOOKUP_CHUNK) {
    const slice = ids.slice(from, from + ID_LOOKUP_CHUNK);
    const { data, error } = await db
      .from("books")
      .select("id, slug, title, book_files(file_url)")
      .in("id", [...slice]);
    if (error) throw new OcrError("BOOK_NOT_FOUND", `books lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      const files = (row.book_files ?? []) as Array<{ file_url: string | null }>;
      byId.set(row.id as string, {
        id: row.id as string,
        slug: (row.slug as string | null) ?? null,
        title: (row.title as string) ?? "",
        fileUrl: files.map((f) => f.file_url).find((u): u is string => !!u) ?? null,
      });
    }
  }

  // Queue order is the operator's order; a Postgres `in` result is not.
  return ids.map((id) => byId.get(id)).filter((b): b is TargetBook => !!b);
}

/** The first pages this record currently holds, for the overwrite decision. */
async function fetchExistingPages(
  db: SupabaseClient,
  recordId: string,
): Promise<{ count: number; sample: { pageNo: number; content: string }[] }> {
  const { count, error: countErr } = await db
    .from("book_pages")
    .select("page_no", { count: "exact", head: true })
    .eq("record_type", "book")
    .eq("record_id", recordId);
  if (countErr) throw new OcrError("DB_WRITE_FAILED", `book_pages count failed: ${countErr.message}`);

  const { data, error } = await db
    .from("book_pages")
    .select("page_no, content")
    .eq("record_type", "book")
    .eq("record_id", recordId)
    .order("page_no", { ascending: true })
    .limit(20);
  if (error) throw new OcrError("DB_WRITE_FAILED", `book_pages read failed: ${error.message}`);

  return {
    count: count ?? 0,
    sample: (data ?? []).map((r) => ({
      pageNo: Number(r.page_no),
      content: String(r.content ?? ""),
    })),
  };
}

// ── The PDF ─────────────────────────────────────────────────────────────────

/**
 * Fetch the book's PDF to a local file, through the SAME allow-list the
 * indexer uses.
 *
 * `file_url` is a database value, so it is never fetched as given:
 * `toAllowedStorageUrl` rebuilds it on an allow-listed origin or returns null.
 * That is the existing SSRF boundary (lib/zima.ts) and this pipeline does not
 * get its own — a second, laxer fetch path would be the whole point of the
 * guard undone.
 *
 * The body is STREAMED to disk rather than buffered: these are 20–100 MB
 * books, and `arrayBuffer()` on each one is how a batch job's memory becomes a
 * function of the largest book in the library.
 */
async function downloadPdf(fileUrl: string, destPath: string): Promise<number> {
  const resolved = await resolvePdfUrl(fileUrl);
  if (!resolved) {
    throw new OcrError(
      "STORAGE_UNRESOLVABLE",
      "The file URL is a bare legacy key and no R2 credentials are configured to presign it.",
    );
  }
  const url = toAllowedStorageUrl(resolved);
  if (!url) {
    throw new OcrError(
      "STORAGE_UNRESOLVABLE",
      "The storage allow-list refused this URL. That is a statement about THIS process's " +
        "ZIMA_API_URL, not about the file — fix the environment rather than the record.",
    );
  }

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new OcrError("PDF_FETCH_FAILED", `storage fetch failed: ${err instanceof Error ? err.message : err}`, err);
  }
  if (!res.ok || !res.body) {
    throw new OcrError("PDF_FETCH_FAILED", `storage answered HTTP ${res.status}`);
  }

  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(destPath));
  const { size } = await fsp.stat(destPath);
  return size;
}

// ── One book ────────────────────────────────────────────────────────────────

async function ocrBook(db: SupabaseClient, book: TargetBook): Promise<BookOutcome> {
  const started = Date.now();
  const outcome: BookOutcome = {
    slug: book.slug,
    title: book.title,
    id: book.id,
    status: APPLY ? "ocr-written" : "dry-run",
    pdfPages: 0,
    pagesProcessed: 0,
    pagesStored: 0,
    elapsedMs: 0,
    pages: [],
  };

  if (!book.fileUrl) {
    return { ...outcome, status: "failed", code: "NO_PDF_FILE", detail: "no PDF on this record", elapsedMs: 0 };
  }

  const workDir = await makeWorkDir();
  const pdfPath = path.join(workDir, "source.pdf");

  try {
    log(`   download…`);
    const bytes = await downloadPdf(book.fileUrl, pdfPath);
    log(`   ${(bytes / 1024 / 1024).toFixed(1)} MB`);

    const totalPages = await pdfPageCount(pdfPath);
    outcome.pdfPages = totalPages;

    /* Ask the one question that does not need the recognizer, before paying
       for it. A record whose pages already read as healthy is skipped whatever
       OCR would have said, and on a resumed batch that is the difference
       between one query and ten minutes of CPU per finished book. */
    const existing = await fetchExistingPages(db, book.id);
    const existingHealth = existing.count > 0 ? sampleForHealth(existing.sample) : null;
    if (canSkipBeforeOcr({ existing: { pages: existing.count, health: existingHealth }, force: FORCE })) {
      return {
        ...outcome,
        status: "skipped",
        code: "EXISTING_TEXT_HEALTHY",
        detail: `already holds ${existing.count} healthy page(s); pass --force to replace them`,
        elapsedMs: Date.now() - started,
      };
    }

    const first = Math.max(1, Math.trunc(PAGE_START));
    const explicitEnd = PAGE_END > 0 ? Math.min(PAGE_END, totalPages) : 0;
    const last = explicitEnd > 0
      ? explicitEnd
      : APPLY
        ? totalPages
        : Math.min(first + DRY_RUN_PAGES - 1, totalPages);

    log(`   ${totalPages} page(s) in the PDF; reading ${first}–${last} at ${DPI} DPI, -l ${LANG}, --psm ${PSM}`);

    const ocrPages: { pageNo: number; content: string }[] = [];

    for (let pageNo = first; pageNo <= last; pageNo++) {
      const prefix = path.join(workDir, `p${pageNo}`);

      const renderStart = Date.now();
      let imagePath = await renderPdfPage({ pdfPath, pageNo, outPrefix: prefix, dpi: DPI });
      if (PREPROCESS !== "none") imagePath = await preprocessImage(imagePath, PREPROCESS);
      const renderMs = Date.now() - renderStart;

      const ocrStart = Date.now();
      const raw = await recognizePage({ imagePath, lang: LANG, psm: PSM, dpi: DPI });
      const ocrMs = Date.now() - ocrStart;

      const processed = postProcessOcrPage(raw);
      const stored = isStorablePage(processed.content);
      if (stored) ocrPages.push({ pageNo, content: processed.content });

      outcome.pages.push({
        pageNo,
        renderMs,
        ocrMs,
        chars: processed.content.length,
        khmerRatio: processed.health.khmerRatio,
        verdict: processed.health.verdict,
        reasons: processed.health.reasons,
        reassembled: processed.reassembled,
        content: processed.content,
        stored,
      });
      outcome.pagesProcessed++;

      log(
        `   page ${String(pageNo).padStart(4)}  render ${String(renderMs).padStart(5)}ms  ` +
          `ocr ${String(ocrMs).padStart(6)}ms  chars ${String(processed.content.length).padStart(5)}  ` +
          `khmer ${processed.health.khmerRatio.toFixed(2)}  ${processed.health.verdict}` +
          `${processed.reassembled ? "  (reassembled)" : ""}${stored ? "" : "  — too short to store"}`,
      );

      // One page of images on disk at a time. A 500-page book at 300 DPI is
      // several GB if these accumulate.
      if (!KEEP_IMAGES) {
        await fsp.rm(`${prefix}.png`, { force: true });
        await fsp.rm(`${prefix}.${PREPROCESS}.png`, { force: true });
      }
    }

    const health = sampleForHealth(ocrPages);
    outcome.health = health;

    const decision = decideRecordWrite({
      existing: { pages: existing.count, health: existingHealth },
      ocr: { pages: ocrPages.length, health },
      force: FORCE,
    });

    if (!decision.write) {
      return {
        ...outcome,
        status: "skipped",
        code: decision.code,
        detail:
          decision.code === "EXISTING_TEXT_HEALTHY"
            ? `this book already holds ${existing.count} healthy page(s); pass --force to replace them`
            : decision.code === "TEXT_HEALTH_FAILED"
              ? `OCR output judged damaged (${health.reasons.join(", ") || "no reason"}) — refusing to store it`
              : "OCR produced no storable page",
        elapsedMs: Date.now() - started,
      };
    }

    if (!APPLY) {
      return {
        ...outcome,
        status: "dry-run",
        detail: `would replace ${decision.replaces} with ${ocrPages.length} OCR page(s)`,
        pagesStored: ocrPages.length,
        elapsedMs: Date.now() - started,
      };
    }

    if (decision.replaces === "healthy-text") {
      log(
        `   ⚠ --force: replacing ${existing.count} page(s) this tool judged HEALTHY with OCR output. ` +
          `This is destructive and is being done because you asked for it.`,
      );
    }

    await writePages(db, book, ocrPages, health);
    return {
      ...outcome,
      status: "ocr-written",
      detail: `replaced ${decision.replaces}`,
      pagesStored: ocrPages.length,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    const code: OcrErrorCode = isOcrError(err) ? err.code : "OCR_PROCESS_FAILED";
    return {
      ...outcome,
      status: "failed",
      code,
      detail: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started,
    };
  } finally {
    if (!KEEP_IMAGES) await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    else log(`   images kept in ${workDir}`);
  }
}

/**
 * Replace this record's pages with the OCR result, and discard what was
 * derived from the text being replaced.
 *
 * Three properties, all borrowed rather than reinvented:
 *
 * **Idempotent.** `deleteRecordPages` then insert, exactly as
 * `indexPdfPages` does, so a second `--apply` over the same book produces the
 * same rows rather than a unique-violation on `(record_type, record_id,
 * page_no)`.
 *
 * **Bounded by the text, not the row count.** `budgetedBatches` sizes each
 * statement by the characters it carries, because `book_pages.content` is GIN
 * trigram indexed and a fixed batch of 100 rows is what timed out in
 * production on books of dense prose.
 *
 * **Absent beats truncated.** A failure mid-insert empties the record before
 * it propagates. A book holding OCR pages 1–100 of 400 answers "found inside"
 * for a quarter of itself and stays silent about the rest, which nothing
 * downstream can distinguish from a book that only mentions the phrase early.
 *
 * `book_chunks` and `resource_semantic_insights` are DELETED and not rebuilt.
 * They were computed from the text this run replaced, so leaving them means
 * semantic search and the assistant keep serving exactly the damage that
 * motivated the run. Rebuilding them is `scripts/embed-library.ts`, kept
 * separate because embedding spends a metered per-day quota and OCR does not —
 * chaining them means one quota stop aborts work that had already succeeded.
 */
async function writePages(
  db: SupabaseClient,
  book: TargetBook,
  pages: readonly { pageNo: number; content: string }[],
  health: TextHealth,
): Promise<void> {
  await deleteRecordPages(db, "book", book.id);
  try {
    for (const batch of budgetedBatches(pages)) {
      await insertBatch(db, "book", book.id, batch);
    }
  } catch (err) {
    await deleteRecordPages(db, "book", book.id).catch(() => {});
    throw new OcrError(
      "PARTIAL_WRITE_CLEANED",
      `insert failed and the record's pages were removed rather than left truncated: ` +
        `${err instanceof Error ? err.message : err}`,
      err,
    );
  }

  const { error: chunkErr } = await db
    .from("book_chunks")
    .delete()
    .eq("record_type", "book")
    .eq("record_id", book.id);
  if (chunkErr) throw new OcrError("DB_WRITE_FAILED", `book_chunks delete: ${chunkErr.message}`);

  const { error: insightErr } = await db
    .from("resource_semantic_insights")
    .delete()
    .eq("record_type", "book")
    .eq("record_id", book.id);
  if (insightErr) {
    throw new OcrError("DB_WRITE_FAILED", `resource_semantic_insights delete: ${insightErr.message}`);
  }

  /* Provenance rides on the state row's `detail`, which already exists and is
     already rendered by the admin Data Quality panel.
     `book_pages` gets no new column: this pipeline replaces a record WHOLE, so
     provenance is a property of the record rather than of a page, and a
     migration that added `source_method` to every one of a library's page rows
     to record a fact that is constant within each record would be schema for
     its own sake. `classifyFailure` returns null for `indexed`, so a detail
     string here schedules no retry and sets no failure kind. */
  await writeIndexState(db, {
    recordType: "book",
    recordId: book.id,
    status: "indexed",
    pages: pages.length,
    // Chunks were just deleted and are scripts/embed-library.ts's to rebuild.
    // Claiming a count here would overstate what this run produced.
    chunks: 0,
    detail:
      `tesseract-ocr lang=${LANG} psm=${PSM} dpi=${DPI} preprocess=${PREPROCESS} ` +
      `verdict=${health.verdict}`,
    sourceDigest: sourceDigest(book.fileUrl ?? ""),
  });
}

// ── Queue ───────────────────────────────────────────────────────────────────

type QueueFile = {
  generatedAt?: string;
  target?: string;
  books?: Array<{ id: string; slug: string | null; title: string; candidateReasons?: string[] }>;
};

function loadQueue(): QueueFile | null {
  if (!fs.existsSync(QUEUE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8")) as QueueFile;
  } catch (err) {
    console.error(`✖ ${QUEUE_PATH} is not readable JSON: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function usage() {
  console.log(`
PTEC Khmer OCR (self-hosted Tesseract — no OCR API, no per-page cost)

  --check-env            Verify tesseract, the khm model and poppler, then exit.
  --slug <slug>          OCR one book.
  --limit <n>            Take the first n books from the queue.
  --queue <path>         Queue file (default scripts/scanned-books-queue.json,
                         or $OCR_QUEUE_PATH).
  --reason <r>           Only queue entries carrying this candidate reason,
                         e.g. no-text-layer (books that hold no text at all, so
                         OCR can only add) vs khmer-legacy-font (OCR REPLACES
                         text — review those individually).

  --dry-run              Default. Reads ${DRY_RUN_PAGES} pages and writes NOTHING.
  --apply                Write the result to book_pages. The only writing mode.
  --force                Allow replacing text this tool judges HEALTHY.
                         It never allows writing OCR output judged damaged.

  --page-start <n>       First PDF page (default 1).
  --page-end <n>         Last PDF page (default: ${DRY_RUN_PAGES} pages in a dry run,
                         the whole document with --apply).
  --dpi <n>              Rasterisation density (default ${DEFAULT_DPI}).
  --psm <n>              Tesseract page segmentation mode (default ${DEFAULT_PSM}).
  --lang <codes>         Tesseract languages (default ${DEFAULT_LANG}; try khm+eng
                         for mixed pages).
  --preprocess <mode>    none | normalize | threshold (default none).

  --output-dir <path>    Where page images are rendered ($OCR_WORK_DIR).
  --keep-images          Do not delete the rendered pages.
  --verbose              Print the full OCR text of every page.
  --json                 Machine-readable report on stdout.
`);
}

async function main() {
  const egress = new EgressRecorder();
  egress.install();

  if (ARGV.length === 0) {
    usage();
    return;
  }

  // Preflight FIRST, always. A missing khm model does not make tesseract fail:
  // it makes it answer in English, and that answer survives a character count,
  // an exit code and a page loop before anything notices.
  const env = await probeOcrEnvironment(LANG.split("+").filter(Boolean));
  log(`tesseract ${env.tesseractVersion}  ·  poppler ${env.popplerVersion ?? "(version not reported)"}`);
  log(`languages: ${env.languages.join(", ")}`);

  if (CHECK_ENV) {
    log(`\nOCR runs locally. Hosts contacted by this check: ${
      egress.hosts().map((h) => `${h.host} ×${h.count}`).join(", ") || "none"
    }`);
    log(`Hosted OCR / inference API calls: ${egress.billedRequests()}`);
    log("Ready.\n");
    egress.restore();
    return;
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let books: TargetBook[];
  if (SLUG) {
    books = [await fetchBookBySlug(db, SLUG)];
  } else if (LIMIT > 0) {
    const queue = loadQueue();
    if (!queue || !queue.books || queue.books.length === 0) {
      console.error(
        `✖ No queue at ${QUEUE_PATH}. Run: npx tsx scripts/audit-scanned-books.ts`,
      );
      process.exit(1);
    }
    const all = queue.books;
    const selected = REASON ? all.filter((b) => (b.candidateReasons ?? []).includes(REASON)) : all;
    if (REASON && selected.length === 0) {
      console.error(
        `✖ No book in ${QUEUE_PATH} carries the reason "${REASON}". ` +
          `Present: ${[...new Set(all.flatMap((b) => b.candidateReasons ?? []))].join(", ")}`,
      );
      process.exit(1);
    }
    books = await fetchBooksById(db, selected.slice(0, LIMIT).map((b) => b.id));
    log(`Queue: ${QUEUE_PATH} (built ${queue.generatedAt ?? "at an unrecorded time"} against ${queue.target ?? "an unrecorded target"})`);
    log(
      REASON
        ? `Filter: --reason ${REASON} — ${selected.length} of ${all.length} entries, taking ${books.length}`
        : `No reason filter — ${all.length} entries, taking ${books.length}`,
    );
  } else {
    usage();
    egress.restore();
    return;
  }

  /* The guard that exists because of the 203-book incident: a process holding
     one deployment's storage configuration and another's database credentials
     observes nothing about the files it is asked about. A dry run writes no
     rows, so it may proceed after a warning — an apply run may not. */
  const target = describeTarget();
  const verdict = judgeEnvironment(books.map((b) => b.fileUrl).filter((u): u is string => !!u));
  log(`\nTarget: ${target.label}  ·  storage hosts: ${verdict.hosts.join(", ") || "(none)"}`);
  if (!verdict.ok) {
    if (APPLY) {
      console.error(`\n✖ ENVIRONMENT MISMATCH — refusing to write.\n\n  ${verdict.reason}\n`);
      process.exit(2);
    }
    log(`\n⚠ ENVIRONMENT MISMATCH — ${verdict.reason}\n  Continuing because this is a dry run.\n`);
  }

  log(
    APPLY
      ? `\n*** APPLY — ${books.length} book(s) WILL be written to ${target.label} ***\n`
      : `\n*** DRY RUN — NO DATABASE WRITES (${books.length} book(s), first ${DRY_RUN_PAGES} page(s) each) ***\n`,
  );

  const results: BookOutcome[] = [];
  for (const [i, book] of books.entries()) {
    log(`[${i + 1}/${books.length}] ${book.title}`);
    log(`   slug: ${book.slug ?? "(none)"}`);
    const result = await ocrBook(db, book);
    results.push(result);
    log(
      `   → ${result.status}${result.code ? ` (${result.code})` : ""}` +
        `${result.detail ? `: ${result.detail}` : ""}  [${(result.elapsedMs / 1000).toFixed(1)}s]`,
    );
    if (result.health) {
      log(
        `   health: ${result.health.verdict}  khmer ${result.health.khmerRatio.toFixed(2)}  ` +
          `coeng ${result.health.coengDensity.toFixed(3)}  dangling ${result.health.danglingCoengRatio.toFixed(3)}  ` +
          `orphanVowels ${result.health.orphanVowelRatio.toFixed(3)}  legacy ${result.health.legacyArtefactRatio.toFixed(3)}` +
          (result.health.reasons.length ? `  reasons: ${result.health.reasons.join(", ")}` : ""),
      );
    }

    // The point of a dry run: a human reads the Khmer. Batch runs stay quiet
    // unless asked, because dumping a library of prose into a log helps nobody.
    if (!AS_JSON && (VERBOSE || (!APPLY && books.length === 1))) {
      for (const page of result.pages) {
        console.log(`\n   ── page ${page.pageNo} — OCR text ${"─".repeat(40)}`);
        console.log(page.content.length > 0 ? page.content : "   (empty)");
      }
      console.log("");
    }
  }

  const hosts = egress.hosts();
  egress.restore();

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          mode: APPLY ? "apply" : "dry-run",
          target: target.label,
          tesseract: env.tesseractVersion,
          languages: env.languages,
          settings: { lang: LANG, psm: PSM, dpi: DPI, preprocess: PREPROCESS },
          cost: { hostedOcrApiCalls: egress.billedRequests(), hostsContacted: hosts },
          books: results.map(({ pages, ...rest }) => ({
            ...rest,
            pages: pages.map(({ content, ...p }) => ({ ...p, chars: content.length })),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const written = results.filter((r) => r.status === "ocr-written").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const pagesRead = results.reduce((n, r) => n + r.pagesProcessed, 0);
  const totalMs = results.reduce((n, r) => n + r.elapsedMs, 0);

  console.log("─".repeat(72));
  console.log(
    APPLY
      ? `Applied. ${written} book(s) written, ${skipped} skipped, ${failed} failed.`
      : `DRY RUN — NO DATABASE WRITES. ${results.length} book(s) examined, ${skipped} would be skipped, ${failed} failed.`,
  );
  if (pagesRead > 0) {
    console.log(
      `${pagesRead} page(s) read in ${(totalMs / 1000).toFixed(1)}s ` +
        `(${(totalMs / pagesRead / 1000).toFixed(2)}s per page).`,
    );
  }
  console.log(`Hosts contacted: ${hosts.map((h) => `${h.host} ×${h.count}`).join(", ") || "none"}`);
  console.log(`Hosted OCR / inference API calls: ${egress.billedRequests()}  ·  OCR API cost: $0`);
  if (APPLY && written > 0) {
    console.log("\nChunks and semantic insights for the rewritten books were deleted, not rebuilt.");
    console.log("Rebuild them with:  npx tsx scripts/embed-library.ts --chunks-only");
  }
  console.log("");

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  if (isOcrError(err)) {
    console.error(`\n✖ ${err.code}: ${err.message}\n`);
    process.exit(3);
  }
  console.error(err);
  process.exit(1);
});
