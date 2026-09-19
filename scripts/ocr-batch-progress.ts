/* scripts/ocr-batch-progress.ts
 *
 * How far has the OCR batch got? Answered from the DATABASE, not from a log.
 *
 *   npx tsx scripts/ocr-batch-progress.ts
 *   npx tsx scripts/ocr-batch-progress.ts --reason no-text-layer
 *   npx tsx scripts/ocr-batch-progress.ts --json
 *
 * READ-ONLY. It writes nothing, anywhere.
 *
 * ── Why this exists rather than `docker logs` ────────────────────────────────
 *
 * The batch runs unattended on the ZimaOS box for days. Its log lives inside a
 * container on a machine the person asking may not be able to reach — during
 * this pipeline's own deployment, Tailscale SSH refused the workstation's user
 * outright, and the run had to be checked from the database instead.
 *
 * That turned out to be the better instrument anyway. `resource_index_state`
 * carries `detail = "tesseract-ocr lang=… psm=… dpi=…"` for every record this
 * pipeline wrote (see `writePages` in scripts/ocr-khmer-tesseract.ts), so the
 * database is a complete, durable record of what the batch has actually
 * COMMITTED — where a log line only says what a process claimed on its way
 * past. A container that was killed mid-book leaves a log full of finished
 * pages and no row; this counts the rows.
 *
 * ── The rate is measured, and its limits are stated ──────────────────────────
 *
 * Throughput comes from the gaps between consecutive `attempted_at` stamps.
 * That is honest only for books written back to back by the same run, so a gap
 * is excluded when it implies an impossible SECONDS-PER-PAGE — see
 * `MAX_PLAUSIBLE_SECONDS_PER_PAGE`, and the bias that a naive duration cut-off
 * introduced instead. An ETA built from a handful of books is a projection, and
 * the report says so rather than printing a date.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describeTarget } from "../lib/indexing/environment";

const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const valueOf = (f: string): string | undefined => {
  const i = ARGV.indexOf(f);
  return i >= 0 && i + 1 < ARGV.length ? ARGV[i + 1] : undefined;
};

const AS_JSON = has("--json");
const REASON = valueOf("--reason") ?? null;
const QUEUE_PATH = path.resolve(
  valueOf("--queue") ?? process.env.OCR_QUEUE_PATH ?? path.join(__dirname, "scanned-books-queue.json"),
);

/**
 * Above this seconds-per-page, a gap is idleness rather than a slow book.
 *
 * The obvious rule — "exclude any gap longer than N minutes" — is wrong, and
 * wrong in the direction that flatters the report. A 321-page book legitimately
 * takes 99 minutes, so a 45-minute cut-off discards exactly the LARGE books and
 * averages only the small ones: it measured 6.3 s/page where back-to-back work
 * was really running at 18.4, and turned a ~6-day ETA into ~43 hours.
 *
 * Normalising by pages separates the two cases properly. A 209-page book that
 * "took" 333 minutes is 95.6 s/page — no page renders that slowly, so the batch
 * was stopped for most of it. A 321-page book at 18.4 s/page is simply a big
 * book, and belongs in the average.
 */
const MAX_PLAUSIBLE_SECONDS_PER_PAGE = 90;
/** Same reason as the OCR engine: a long `in(...)` filter is `414 URI too long`. */
const ID_LOOKUP_CHUNK = 50;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type QueueBook = { id: string; slug: string | null; title: string; candidateReasons?: string[] };
type StateRow = {
  record_id: string;
  status: string;
  pages: number;
  detail: string | null;
  attempted_at: string;
};

/** Records this pipeline wrote, identified by the provenance it stamps. */
const isOcrWritten = (row: StateRow | undefined): boolean =>
  (row?.detail ?? "").startsWith("tesseract-ocr");

async function fetchStates(ids: readonly string[]): Promise<Map<string, StateRow>> {
  const byId = new Map<string, StateRow>();
  for (let from = 0; from < ids.length; from += ID_LOOKUP_CHUNK) {
    const slice = ids.slice(from, from + ID_LOOKUP_CHUNK);
    const { data, error } = await db
      .from("resource_index_state")
      .select("record_id, status, pages, detail, attempted_at")
      .eq("record_type", "book")
      .in("record_id", [...slice]);
    if (error) throw new Error(`resource_index_state read failed: ${error.message}`);
    for (const row of (data ?? []) as StateRow[]) byId.set(row.record_id, row);
  }
  return byId;
}

function main() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.error(`✖ No queue at ${QUEUE_PATH}. Run: npx tsx scripts/audit-scanned-books.ts`);
    process.exit(1);
  }
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8")) as { books?: QueueBook[] };
  const all = queue.books ?? [];
  const selected = REASON ? all.filter((b) => (b.candidateReasons ?? []).includes(REASON)) : all;

  fetchStates(selected.map((b) => b.id))
    .then((states) => {
      const done = selected.filter((b) => isOcrWritten(states.get(b.id)));
      const pending = selected.filter((b) => !isOcrWritten(states.get(b.id)));
      const failed = selected.filter((b) => states.get(b.id)?.status === "failed");
      const pagesWritten = done.reduce((n, b) => n + (states.get(b.id)?.pages ?? 0), 0);

      // Rate, from back-to-back completions only.
      const stamps = done
        .map((b) => ({ at: new Date(states.get(b.id)!.attempted_at), pages: states.get(b.id)!.pages }))
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      let activeSeconds = 0;
      let activePages = 0;
      for (let i = 1; i < stamps.length; i++) {
        const gapMs = stamps[i].at.getTime() - stamps[i - 1].at.getTime();
        const pages = stamps[i].pages;
        if (gapMs <= 0 || pages <= 0) continue;
        // Judge the gap by what it implies PER PAGE, never by its length.
        if (gapMs / 1000 / pages > MAX_PLAUSIBLE_SECONDS_PER_PAGE) continue;
        activeSeconds += gapMs / 1000;
        activePages += pages;
      }
      const secondsPerPage = activePages > 0 ? activeSeconds / activePages : null;
      const meanPages = done.length > 0 ? pagesWritten / done.length : null;
      const etaHours =
        secondsPerPage !== null && meanPages !== null
          ? (pending.length * meanPages * secondsPerPage) / 3600
          : null;
      const last = stamps.length > 0 ? stamps[stamps.length - 1].at : null;
      const idleMinutes = last ? (Date.now() - last.getTime()) / 60_000 : null;

      if (AS_JSON) {
        console.log(
          JSON.stringify(
            {
              target: describeTarget().label,
              queue: QUEUE_PATH,
              reason: REASON,
              total: selected.length,
              complete: done.length,
              remaining: pending.length,
              failed: failed.length,
              pagesWritten,
              secondsPerPage,
              etaHours,
              lastCompletionAt: last?.toISOString() ?? null,
              idleMinutes,
              samplePages: activePages,
            },
            null,
            2,
          ),
        );
        return;
      }

      const pct = selected.length > 0 ? (done.length / selected.length) * 100 : 0;
      const width = 34;
      const filled = Math.round((pct / 100) * width);
      console.log(`\nOCR batch — ${describeTarget().label}`);
      if (REASON) console.log(`filter: --reason ${REASON}`);
      console.log(`\n  [${"█".repeat(filled)}${"·".repeat(width - filled)}] ${pct.toFixed(1)}%`);
      console.log(`  ${done.length} of ${selected.length} books · ${pagesWritten.toLocaleString()} pages written`);
      if (failed.length > 0) console.log(`  ⚠ ${failed.length} recorded as failed`);

      if (secondsPerPage !== null) {
        console.log(
          `\n  rate: ${secondsPerPage.toFixed(1)} s/page (over ${activePages.toLocaleString()} pages of ` +
            `back-to-back work; gaps implying > ${MAX_PLAUSIBLE_SECONDS_PER_PAGE} s/page excluded as idle)`,
        );
        if (etaHours !== null) {
          const basis = `${pending.length} books × ~${Math.round(meanPages!)} pages`;
          console.log(
            `  ETA:  ~${etaHours < 48 ? `${etaHours.toFixed(0)} hours` : `${(etaHours / 24).toFixed(1)} days`}` +
              ` (${basis}) — a projection from ${stamps.length} completions, not a promise`,
          );
        }
      } else {
        console.log("\n  rate: not measurable yet — needs two back-to-back completions");
      }

      if (idleMinutes !== null) {
        console.log(
          `\n  last completion: ${last!.toISOString().slice(0, 16).replace("T", " ")}Z ` +
            `(${idleMinutes.toFixed(0)} min ago)` +
            (secondsPerPage !== null && meanPages !== null && idleMinutes * 60 > 3 * meanPages * secondsPerPage
              ? "  ⚠ well past a typical book — is the container still up?"
              : ""),
        );
      }
      console.log("");
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

main();
