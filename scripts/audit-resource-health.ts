// scripts/audit-resource-health.ts
//
//   npx tsx scripts/audit-resource-health.ts
//   npx tsx scripts/audit-resource-health.ts --list not_ai_ready
//   npx tsx scripts/audit-resource-health.ts --json
//
// One DERIVED readiness model for every published digital resource, computed
// from the tables that already hold the facts. No new columns: a stored
// readiness flag is a second source of truth that can disagree with the rows
// it describes, which is the failure `resource_index_state.chunks` already
// demonstrates — it sums to 175 across the collection while `book_chunks`
// holds six figures.
//
// The stages are ordered, and each one is a precondition for the next:
//
//   metadata_ready  title, author, category, description present
//   file_ready      a storage URL exists to read
//   text_ready      `book_pages` rows exist  → exact "found inside" search
//   chunk_ready     `book_chunks` rows exist → the semantic leg can run
//   embedding_ready every chunk carries a vector
//   search_ready    metadata_ready && file_ready            (findable)
//   ai_ready        text_ready && chunk_ready && embedding_ready
//
// `ai_ready = false` is not automatically a defect. An image-only scan is
// legitimately and permanently not AI-ready, and the point of this model is
// that every resource can SAY which it is — see `reason`.
//
// Read-only. Every statement is a SELECT.

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const JSON_OUT = process.argv.includes("--json");
const listIdx = process.argv.indexOf("--list");
const LIST = listIdx >= 0 ? process.argv[listIdx + 1] : null;

type Reason =
  | "ok"
  | "no_text_layer"      // image-only scan: permanent, and correct
  | "index_failed"       // extraction crashed — ours to fix
  | "never_indexed"      // extraction has not run
  | "not_embedded"       // has text, no chunks — a backfill has not run
  | "partial_embedding"  // chunks exist, some carry no vector
  | "missing_file"       // published with nothing to read
  | "missing_metadata";

async function allRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  table: string,
  columns: string,
  shape: (q: any) => any = (q) => q,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await shape(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const books = await allRows<any>(db, "books", "id,slug,title,description,category_id,author_id,cover_url,is_published", (q) =>
    q.eq("is_published", true));
  const files = await allRows<any>(db, "book_files", "book_id,file_url");
  const states = await allRows<any>(db, "resource_index_state", "record_type,record_id,status,failure_kind");
  const pages = await allRows<any>(db, "book_pages", "record_id", (q) => q.eq("record_type", "book"));
  const chunks = await allRows<any>(db, "book_chunks", "record_id,embedding", (q) => q.eq("record_type", "book"));

  const fileFor = new Map<string, string>();
  for (const f of files) if (f.file_url && !fileFor.has(f.book_id)) fileFor.set(f.book_id, f.file_url);
  const stateFor = new Map(states.filter((s) => s.record_type === "book").map((s) => [s.record_id, s]));
  const pageCount = new Map<string, number>();
  for (const p of pages) pageCount.set(p.record_id, (pageCount.get(p.record_id) ?? 0) + 1);
  const chunkCount = new Map<string, number>();
  const chunkNoVec = new Map<string, number>();
  for (const c of chunks) {
    chunkCount.set(c.record_id, (chunkCount.get(c.record_id) ?? 0) + 1);
    if (c.embedding === null) chunkNoVec.set(c.record_id, (chunkNoVec.get(c.record_id) ?? 0) + 1);
  }

  const rows = books.map((b) => {
    const metadata_ready = Boolean(b.title && b.author_id && b.category_id && b.description);
    const file_ready = fileFor.has(b.id);
    const nPages = pageCount.get(b.id) ?? 0;
    const nChunks = chunkCount.get(b.id) ?? 0;
    const text_ready = nPages > 0;
    const chunk_ready = nChunks > 0;
    const embedding_ready = chunk_ready && (chunkNoVec.get(b.id) ?? 0) === 0;
    const st = stateFor.get(b.id);

    let reason: Reason = "ok";
    if (!metadata_ready) reason = "missing_metadata";
    else if (!file_ready) reason = "missing_file";
    else if (!text_ready) {
      reason =
        st?.status === "no_text_layer" ? "no_text_layer"
        : st?.status === "failed" ? "index_failed"
        : !st ? "never_indexed"
        : "never_indexed";
    } else if (!chunk_ready) reason = "not_embedded";
    else if (!embedding_ready) reason = "partial_embedding";

    return {
      id: b.id, slug: b.slug, title: b.title as string,
      metadata_ready, file_ready, text_ready, chunk_ready, embedding_ready,
      search_ready: metadata_ready && file_ready,
      ai_ready: text_ready && chunk_ready && embedding_ready,
      pages: nPages, chunks: nChunks, status: st?.status ?? null, reason,
    };
  });

  if (JSON_OUT) { console.log(JSON.stringify(rows, null, 2)); return; }

  const n = rows.length;
  const pct = (k: number) => `${((k / n) * 100).toFixed(1)}%`;
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;

  console.log(`\nResource health — ${n} published books — ${new Date().toISOString()}\n`);
  const stages: [string, (r: (typeof rows)[number]) => boolean][] = [
    ["metadata_ready", (r) => r.metadata_ready],
    ["file_ready", (r) => r.file_ready],
    ["text_ready", (r) => r.text_ready],
    ["chunk_ready", (r) => r.chunk_ready],
    ["embedding_ready", (r) => r.embedding_ready],
    ["search_ready", (r) => r.search_ready],
    ["ai_ready", (r) => r.ai_ready],
  ];
  console.table(stages.map(([label, f]) => ({ stage: label, ready: count(f), missing: n - count(f), coverage: pct(count(f)) })));

  const byReason = new Map<string, number>();
  for (const r of rows) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  console.log("Why a resource is not fully ready — the reason is the fix:");
  console.table([...byReason].sort((a, b) => b[1] - a[1]).map(([reason, k]) => ({ reason, books: k })));

  const permanent = count((r) => r.reason === "no_text_layer");
  const actionable = count((r) => !r.ai_ready) - permanent;
  console.log(`ai_ready:        ${count((r) => r.ai_ready)} / ${n}  (${pct(count((r) => r.ai_ready))})`);
  console.log(`  permanently not AI-ready (image-only scans): ${permanent}`);
  console.log(`  ACTIONABLE — a backfill or a fix would help:  ${actionable}`);

  if (LIST) {
    const match =
      LIST === "not_ai_ready" ? rows.filter((r) => !r.ai_ready)
      : rows.filter((r) => r.reason === LIST);
    console.log(`\n${match.length} matching "${LIST}":`);
    for (const r of match) console.log(`  [${r.reason}] ${r.title?.slice(0, 62)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
