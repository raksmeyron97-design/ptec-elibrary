/* scripts/build-semantic-insights.ts
 *
 * Compute `resource_semantic_insights` (0137) for published resources: which
 * catalogue topics each document demonstrably covers, and the body pages that
 * prove each one.
 *
 * Every decision it makes lives in the pure modules under lib/semantic/, so
 * this file is only I/O, batching and reporting. That split is deliberate —
 * the unit tests and this script run the identical logic, and a dry run here
 * is a faithful preview of what a write would store.
 *
 * Setup:
 *   npm i -D dotenv tsx
 *
 * Run:
 *   npx tsx scripts/build-semantic-insights.ts --dry-run          # report only, writes nothing
 *   npx tsx scripts/build-semantic-insights.ts --dry-run --verbose
 *   npx tsx scripts/build-semantic-insights.ts --limit 20         # pilot: first 20 eligible
 *   npx tsx scripts/build-semantic-insights.ts --only <slug>      # one record
 *   npx tsx scripts/build-semantic-insights.ts --all              # recompute every record
 *
 * Idempotency: rows are keyed (record_type, record_id) and upserted. Re-running
 * over a record replaces its row and can never produce a second one. Without
 * --all, a record whose stored row already carries the current
 * SEMANTIC_VERSION and the current source digest is skipped, so a resumed run
 * costs one cheap page-count query per already-done record.
 *
 * Safety: --dry-run is the default posture for a first run against any
 * database you did not create. This script only READS book_pages, so it cannot
 * damage the corpus, but it WRITES insights, and an insight computed from a
 * half-finished extraction would be published as fact.
 */

import { config } from "dotenv";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// tsx does NOT auto-load env like Next.js. Load .env.local then .env, the same
// order every other script in this repository uses.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { buildInsights, SEMANTIC_VERSION, type SemanticInsights } from "../lib/semantic/build";
import type { PageInput } from "../lib/semantic/passages";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};

const DRY_RUN = has("--dry-run");
const VERBOSE = has("--verbose");
const FORCE_ALL = has("--all");
const ONLY = valueOf("--only");
const LIMIT = Number(valueOf("--limit") ?? "0") || 0;

/** book_pages rows fetched per round trip. Matches lib/chunk-embed.ts. */
const PAGE_FETCH = 500;

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

type BookRow = { id: string; slug: string; title: string; tags: string[] | null; authors: { name: string } | null };

/**
 * Digest of the extracted corpus a row was derived from.
 *
 * Page count, highest page number and total character count — enough that a
 * re-extraction changes it and a no-op re-run does not, without hashing 4 MB
 * of text per book. The same reasoning as `resource_index_state.source_digest`
 * (0133): this answers "has the input changed", not "what is the input".
 */
function sourceDigest(pages: readonly PageInput[]): string {
  const chars = pages.reduce((sum, p) => sum + p.content.length, 0);
  const maxPage = pages.reduce((max, p) => Math.max(max, p.pageNo), 0);
  return createHash("sha256")
    .update(`v${SEMANTIC_VERSION}:${pages.length}:${maxPage}:${chars}`)
    .digest("hex")
    .slice(0, 64);
}

/** Retries a transient network failure. A full run makes several hundred
 *  round trips and a single dropped socket must not discard the work already
 *  done — the same reason lib/chunk-embed.ts backs off rather than aborting. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const backoffs = [1_000, 4_000, 10_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === backoffs.length) break;
      console.warn(`    ⚠ ${label} failed (${err instanceof Error ? err.message : err}); retrying…`);
      await new Promise((r) => setTimeout(r, backoffs[attempt]));
    }
  }
  throw lastErr;
}

async function fetchPages(recordId: string): Promise<PageInput[]> {
  const pages: PageInput[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await withRetry(`book_pages ${recordId}`, async () =>
      db
        .from("book_pages")
        .select("page_no, content")
        .eq("record_type", "book")
        .eq("record_id", recordId)
        .order("page_no", { ascending: true })
        .range(from, from + PAGE_FETCH - 1),
    );
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) pages.push({ pageNo: row.page_no as number, content: row.content as string });
    from += data.length;
    if (data.length < PAGE_FETCH) break;
  }
  return pages;
}

async function storedRow(recordId: string) {
  const { data } = await db
    .from("resource_semantic_insights")
    .select("semantic_version, source_digest, status")
    .eq("record_type", "book")
    .eq("record_id", recordId)
    .maybeSingle<{ semantic_version: number; source_digest: string | null; status: string }>();
  return data ?? null;
}

async function writeRow(record: BookRow, insights: SemanticInsights, digest: string) {
  const { error } = await db.from("resource_semantic_insights").upsert(
    {
      record_type: "book",
      record_id: record.id,
      semantic_version: insights.version,
      status: insights.status,
      topics: insights.topics,
      page_counts: insights.pages,
      text_health: insights.textHealth,
      source_digest: digest,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "record_type,record_id" },
  );
  if (error) throw new Error(error.message);
}

async function main() {
  console.log(
    `\n▶ semantic insights v${SEMANTIC_VERSION} — ${DRY_RUN ? "DRY RUN (writes nothing)" : "WRITING"}`,
  );
  console.log(`  target: ${SUPABASE_URL}\n`);

  let query = db
    .from("books")
    .select("id, slug, title, tags, authors(name)")
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  if (ONLY) query = query.eq("slug", ONLY);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const books = (data ?? []) as unknown as BookRow[];

  const tally: Record<string, number> = {};
  const bump = (key: string) => (tally[key] = (tally[key] ?? 0) + 1);

  let processed = 0;
  let topicsTotal = 0;
  const withTopics: { slug: string; topics: number; labels: string[] }[] = [];

  for (const book of books) {
    if (LIMIT && processed >= LIMIT) break;

    const pages = await fetchPages(book.id);
    const digest = sourceDigest(pages);

    if (!FORCE_ALL && !DRY_RUN) {
      const existing = await storedRow(book.id);
      if (existing && existing.semantic_version === SEMANTIC_VERSION && existing.source_digest === digest) {
        bump("skipped (current)");
        continue;
      }
    }

    const insights = buildInsights({
      pages,
      tags: (book.tags ?? []) as string[],
      title: book.title,
      authors: book.authors?.name ? [book.authors.name] : [],
    });

    bump(insights.status);
    processed++;
    topicsTotal += insights.topics.length;

    if (insights.status === "ok") {
      withTopics.push({
        slug: book.slug,
        topics: insights.topics.length,
        labels: insights.topics.map((t) => t.label),
      });
    }

    if (VERBOSE) {
      const health = insights.textHealth
        ? `${insights.textHealth.script}/${insights.textHealth.verdict}${
            insights.textHealth.reasons.length ? ` (${insights.textHealth.reasons.join(",")})` : ""
          }`
        : "—";
      console.log(
        `  ${insights.status.padEnd(19)} ${String(pages.length).padStart(5)}p  ${health.padEnd(46)} ${book.slug}`,
      );
      for (const topic of insights.topics) {
        console.log(`      ★ ${topic.label} — ${topic.pages.length + topic.morePages} pages, ${topic.mentions} mentions`);
      }
    }

    if (!DRY_RUN) await writeRow(book, insights, digest);
  }

  console.log(`\n── summary ──────────────────────────────────────────────`);
  console.log(`  records examined     ${processed}`);
  for (const [key, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(20)} ${count}`);
  }
  console.log(`  topics published     ${topicsTotal}`);
  if (withTopics.length > 0) {
    const avg = (topicsTotal / withTopics.length).toFixed(1);
    console.log(`  avg topics/record    ${avg}`);
  }
  if (DRY_RUN) console.log(`\n  Nothing was written. Re-run without --dry-run to store these rows.`);
  console.log();
}

main().catch((err) => {
  console.error("✖", err instanceof Error ? err.message : err);
  process.exit(1);
});
