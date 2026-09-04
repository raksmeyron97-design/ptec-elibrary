/* scripts/backfill-index.ts
 *
 * The operator-facing entry point for retrieval index recovery.
 *
 *   npm run backfill:index -- --dry-run
 *   npm run backfill:index -- --limit=10
 *   npm run backfill:index -- --resource-type=books
 *   npm run backfill:index -- --retry-failed
 *   npm run backfill:index -- --all
 *   npm run backfill:index -- --embed
 *
 * It DELEGATES rather than reimplements: selection, claiming, extraction and
 * state writing all come from lib/indexing/reconcile.ts, the same code the
 * hourly cron runs. A backfill that behaves differently from the reconciler is
 * a second definition of "needs work", and the two would drift.
 *
 * ── Why this script exists at all ───────────────────────────────────────────
 *
 * `scripts/extract-pdf-text.ts` already extracted text. It was also run from a
 * laptop against production, with `.env.local` supplying
 * `ZIMA_API_URL=http://localhost:4000`, and it recorded 203 healthy books as
 * `unfetchable` — a verdict about the operator's machine, written into the
 * production health table as though it were a fact about the library.
 *
 * So the two things this adds over calling the library directly are both
 * safety rails, not features:
 *
 *   1. It says out loud which database it is about to write to, before it
 *      writes anything.
 *   2. It refuses to run when this process's storage allow-list cannot reach
 *      the files in that database.
 *
 * Selection is always by STATE, never by id range: "the next 10 that need
 * work" is resumable by construction, and `--limit=10` run twenty times does
 * the whole library with no bookkeeping on the operator's part.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import {
  listIndexableResources,
  reconcileIndex,
  selectWork,
  DEFAULT_BATCH,
} from "../lib/indexing/reconcile";
import { describeTarget, judgeEnvironment, PROBE_SAMPLE_SIZE } from "../lib/indexing/environment";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (name: string): string | undefined => {
  const hit = argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
};

const DRY_RUN = has("--dry-run");
const ALL = has("--all");
const EMBED = has("--embed");
const rawLimit = Number(valueOf("--limit"));
const LIMIT = ALL ? 100_000 : Number.isFinite(rawLimit) && rawLimit > 0 ? Math.trunc(rawLimit) : DEFAULT_BATCH;
const TYPE_FILTER = valueOf("--resource-type");

const TYPE_ALIASES: Record<string, string> = {
  books: "book",
  book: "book",
  theses: "research",
  thesis: "research",
  research: "research",
  publications: "publication",
  publication: "publication",
};

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  const target = describeTarget();
  const resources = await listIndexableResources(db);
  const verdict = judgeEnvironment(resources.slice(0, PROBE_SAMPLE_SIZE).map((r) => r.fileUrl));

  console.log("==================================================");
  console.log("  PTEC e-Library — retrieval index backfill");
  console.log("==================================================");
  console.log(`  Target        : ${target.label}`);
  console.log(`  Mode          : ${DRY_RUN ? "DRY RUN (writes nothing)" : "BACKFILL (writes)"}`);
  console.log(`  Action        : EXTRACT → PAGES${EMBED ? " → CHUNK → EMBED" : ""}`);
  console.log(`  Resources     : ${resources.length} published with a file`);
  console.log(`  Limit         : ${ALL ? "ALL" : LIMIT}`);
  if (TYPE_FILTER) console.log(`  Type filter   : ${TYPE_FILTER}`);
  console.log(`  Storage hosts : ${verdict.hosts.join(", ") || "(none)"}`);
  console.log(`  Allow-list    : ${verdict.allowedHint}`);
  console.log("==================================================");

  /* The guard that the incident argues for. It runs BEFORE any write, and it
     aborts rather than warning: a process whose allow-list cannot reach these
     files learns nothing by trying, and everything it would record is a
     statement about this machine. */
  if (!verdict.ok) {
    console.error("\n✖ ENVIRONMENT MISMATCH — refusing to run.\n");
    console.error(`  ${verdict.reason}\n`);
    console.error("  This is almost always a local shell pointed at a remote database:");
    console.error("  scripts load .env.local BEFORE .env, so a dev ZIMA_API_URL wins even");
    console.error("  when the Supabase credentials are production's.\n");
    console.error("  Fix: run with the same storage configuration as the target deployment,");
    console.error("  or run the sweep on the box (`/api/cron/index-reconcile`).\n");
    process.exit(2);
  }

  if (target.isProduction && !DRY_RUN) {
    console.log("\n⚠  Writing to a REMOTE database. Ctrl-C within 5s to abort.\n");
    await new Promise((r) => setTimeout(r, 5000));
  }

  const filtered = TYPE_FILTER
    ? resources.filter((r) => r.recordType === (TYPE_ALIASES[TYPE_FILTER] ?? TYPE_FILTER))
    : resources;

  if (TYPE_FILTER && filtered.length === 0) {
    console.error(`✖ Unknown --resource-type=${TYPE_FILTER}. Use books | theses | publications.`);
    process.exit(1);
  }

  if (DRY_RUN) {
    /* A dry run must reach the same verdict as a real one, so it asks the
       reconciler rather than re-deriving eligibility here. */
    const { data: stateRows } = await db
      .from("resource_index_state")
      .select("record_type, record_id, status, failure_kind, source_digest, next_attempt_at, claimed_at");
    const states = new Map(
      (stateRows ?? []).map((r) => [`${r.record_type}:${r.record_id}`, r]),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const work = selectWork(filtered, states as any, new Date(), LIMIT);
    console.log(`\nWould process ${work.length} of ${filtered.length} resource(s):\n`);
    const byReason = new Map<string, number>();
    for (const w of work) byReason.set(w.reason, (byReason.get(w.reason) ?? 0) + 1);
    for (const [reason, n] of [...byReason].sort()) console.log(`  ${String(n).padStart(4)}  ${reason}`);
    for (const w of work.slice(0, 20)) {
      console.log(`   · [${w.reason}] ${w.recordType} ${w.title.slice(0, 60)}`);
    }
    if (work.length > 20) console.log(`   … and ${work.length - 20} more`);
    console.log("\nDry run complete. Nothing was written.");
    return;
  }

  const report = await reconcileIndex(db, { limit: LIMIT, runnerId: "backfill:cli" });

  console.log("\n──────────────────────────────────────────────────");
  console.log(`  scanned        ${report.scanned}`);
  console.log(`  eligible       ${report.eligible}`);
  console.log(`  processed      ${report.processed}`);
  console.log(`  → indexed      ${report.indexed}`);
  console.log(`  → no text      ${report.noTextLayer}`);
  console.log(`  → unfetchable  ${report.unfetchable}`);
  console.log(`  → failed       ${report.failed}`);
  console.log("──────────────────────────────────────────────────");

  if (report.eligible > report.processed) {
    console.log(`\n${report.eligible - report.processed} still eligible — re-run to continue.`);
  }

  if (EMBED) {
    console.log("\n👉 Embedding is a separate, metered pass. Run:");
    console.log("     npx tsx scripts/embed-library.ts");
    console.log("   It spends Gemini quota and the free tier has a per-DAY cap, so a large");
    console.log("   backlog is expected to stop partway and resume on a later run.");
  }

  console.log("\nVerify:  SELECT * FROM public_resource_index_health;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
