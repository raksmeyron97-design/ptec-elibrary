/* scripts/embed-library.ts
 *
 * Backfill embeddings for books, research_reports, publications, and
 * catalog_books (metadata → per-table embedding column, 0029), plus
 * page-level chunk embeddings (book_pages → book_chunks, 0082) for passage
 * search and page-cited RAG.
 *
 * New uploads embed themselves automatically (indexPdfPagesSafe chains
 * lib/chunk-embed.ts), so this script is the backfill / repair safety net.
 * Chunk embedding is idempotent at record granularity: a record that already
 * has book_chunks rows is skipped unless --all is passed. Records are only
 * written after every chunk embedded successfully, so a partial failure never
 * strands a half-embedded record.
 *
 * Setup:
 *   npm i -D dotenv tsx
 *
 * Run:
 *   npx tsx scripts/embed-library.ts                  # only missing embeddings (metadata + chunks)
 *   npx tsx scripts/embed-library.ts --all            # re-embed everything
 *   npx tsx scripts/embed-library.ts --chunks-only    # skip the metadata phase
 *   npx tsx scripts/embed-library.ts --metadata-only  # skip the chunk phase
 *   npx tsx scripts/embed-library.ts --limit 5        # cap chunk-phase records (verification runs)
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY
 */

import { config } from "dotenv";
import {
  academicTextToPlainText,
  normalizePublicationReferences,
} from "../lib/publications/citations";
// tsx does NOT auto-load env like Next.js. Load .env.local then .env explicitly.
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { embedRecordChunks, isDailyQuotaError } from "../lib/chunk-embed";
import type { PageRecordType } from "../lib/pdf-page-index";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.");
  console.error("  Loaded:", {
    url: Boolean(SUPABASE_URL),
    service_key: Boolean(SERVICE_KEY),
    gemini_key: Boolean(GEMINI_KEY),
  });
  process.exit(1);
}

const REEMBED_ALL = process.argv.includes("--all");
const CHUNKS_ONLY = process.argv.includes("--chunks-only");
const METADATA_ONLY = process.argv.includes("--metadata-only");
const limitArg = process.argv.indexOf("--limit");
const CHUNK_RECORD_LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) || 0 : 0;

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768; // must match the vector(768) columns
const BATCH = 20; // texts per Gemini embed call
const PAGE = 200; // rows fetched per DB page

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

// ── Embedding ────────────────────────────────────────────────────────────────
function normalize(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / mag);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts,
    config: { outputDimensionality: EMBED_DIM, taskType: "RETRIEVAL_DOCUMENT" },
  });
  const embs = res.embeddings ?? [];
  if (embs.length !== texts.length) {
    throw new Error(`embedding count ${embs.length} != input ${texts.length}`);
  }
  return embs.map((e) => normalize(e.values ?? []));
}

function clean(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

// ── Per-table config ─────────────────────────────────────────────────────────
type TableJob = {
  table: string;
  select: string;
  toText: (row: any) => string;
};

const JOBS: TableJob[] = [
  {
    table: "books",
    select: "id, title, description, department, tags, embedding, authors(name), categories(name)",
    toText: (b) =>
      [
        clean(b.title),
        clean(b.authors?.name),
        clean(b.categories?.name),
        clean(b.department),
        clean(b.description),
        Array.isArray(b.tags) ? b.tags.map(clean).join(" ") : "",
      ]
        .filter(Boolean)
        .join(" — "),
  },
  {
    table: "research_reports",
    select: "id, title, abstract, author_names, keywords, department, subject, embedding",
    toText: (r) =>
      [
        clean(r.title),
        clean(r.author_names),
        clean(r.subject),
        clean(r.department),
        clean(r.abstract),
        Array.isArray(r.keywords) ? r.keywords.map(clean).join(" ") : "",
      ]
        .filter(Boolean)
        .join(" — "),
  },
  {
    table: "publications",
    select: "id, title, title_km, journal_name, abstract, references, keywords, embedding",
    toText: (p) =>
      [
        clean(p.title),
        clean(p.title_km),
        clean(p.journal_name),
        clean(academicTextToPlainText(p.abstract, normalizePublicationReferences(p.references))),
        Array.isArray(p.keywords) ? p.keywords.map(clean).join(" ") : "",
      ]
        .filter(Boolean)
        .join(" — "),
  },
  {
    table: "catalog_books",
    select: "id, title, description, author, category, department, keywords, embedding",
    toText: (c) =>
      [
        clean(c.title),
        clean(c.author),
        clean(c.category),
        clean(c.department),
        clean(c.description),
        Array.isArray(c.keywords) ? c.keywords.map(clean).join(" ") : "",
      ]
        .filter(Boolean)
        .join(" — "),
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────
async function processTable(job: TableJob): Promise<{ embedded: number; failed: number }> {
  console.log(`\n▶ ${job.table}`);
  let embedded = 0;
  let failed = 0;
  let skippedEmpty = 0;

  // Scan every row once via range pagination (works for both modes, no shifting
  // window and no infinite loop).
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await db
      .from(job.table)
      .select(job.select)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`  ✖ fetch failed:`, error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    // Pick rows that need embedding.
    const items = rows
      .filter((r: any) => REEMBED_ALL || r.embedding == null)
      .map((r: any) => ({ id: r.id as string, text: job.toText(r) }));

    const embeddable = items.filter((x) => x.text.length > 0);
    skippedEmpty += items.length - embeddable.length;

    for (let i = 0; i < embeddable.length; i += BATCH) {
      const slice = embeddable.slice(i, i + BATCH);

      let vecs: number[][];
      try {
        vecs = await embedBatch(slice.map((x) => x.text));
      } catch (e) {
        console.error(`\n  ✖ embed failed, retrying once:`, (e as Error).message);
        await new Promise((r) => setTimeout(r, 1500));
        vecs = await embedBatch(slice.map((x) => x.text)); // throws loudly if it fails again
      }

      // Update each row and CHECK the result — this is what surfaces silent failures.
      const results = await Promise.all(
        slice.map((x, k) => db.from(job.table).update({ embedding: vecs[k] }).eq("id", x.id)),
      );
      for (const r of results) {
        if (r.error) {
          failed++;
          if (failed <= 3) console.error(`\n  ✖ update error:`, r.error.message);
        } else {
          embedded++;
        }
      }
      process.stdout.write(`\r  embedded ${embedded}, failed ${failed}…`);
    }

    if (rows.length < PAGE) break;
  }

  console.log(
    `\r  ✔ ${job.table}: ${embedded} embedded, ${failed} failed, ${skippedEmpty} skipped (empty text)`,
  );
  return { embedded, failed };
}

// ── Chunk embeddings (book_pages → book_chunks, migration 0082) ─────────────
/**
 * All "type:id" pairs present in a polymorphic table. One row per PAGE/CHUNK
 * (tens of thousands) and PostgREST caps un-ranged selects at 1000 rows, so
 * page through explicitly — same caution as scripts/extract-pdf-text.ts.
 */
async function fetchRecordKeys(table: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const SCAN = 1000;
  for (let from = 0; ; from += SCAN) {
    const { data, error } = await db
      .from(table)
      .select("record_type, record_id")
      .order("id", { ascending: true })
      .range(from, from + SCAN - 1);
    if (error) throw new Error(`${table} scan failed: ${error.message}`);
    for (const r of data ?? []) keys.add(`${r.record_type}:${r.record_id}`);
    if (!data || data.length < SCAN) break;
  }
  return keys;
}

async function processChunks(): Promise<{ failed: number }> {
  const [pageKeys, chunkedKeys] = await Promise.all([
    fetchRecordKeys("book_pages"),
    REEMBED_ALL ? Promise.resolve(new Set<string>()) : fetchRecordKeys("book_chunks"),
  ]);

  let targets = [...pageKeys].filter((k) => !chunkedKeys.has(k)).sort();
  if (CHUNK_RECORD_LIMIT > 0) targets = targets.slice(0, CHUNK_RECORD_LIMIT);

  console.log(`\n▶ book_chunks: ${targets.length} records to embed (${chunkedKeys.size} already embedded, skipped)`);

  let done = 0, embeddedRecords = 0, totalChunks = 0, failed = 0;
  for (const key of targets) {
    done++;
    const [recordType, recordId] = key.split(":") as [PageRecordType, string];
    try {
      const result = await embedRecordChunks({
        recordType,
        recordId,
        db,
        onProgress: (n, total) =>
          process.stdout.write(`\r  [${done}/${targets.length}] ${key} — ${n}/${total} chunks…   `),
      });
      if (result.embedded) {
        embeddedRecords++;
        totalChunks += result.chunks;
        console.log(`\r  [${done}/${targets.length}] ${key} — ${result.chunks} chunks from ${result.pages} pages`);
      } else {
        console.log(`\r  [${done}/${targets.length}] ${key} — skipped (${result.reason})`);
      }
    } catch (err) {
      failed++;
      console.log(`\r  [${done}/${targets.length}] ${key} — FAILED: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      if (isDailyQuotaError(err)) {
        console.error("  ✖ Gemini DAILY embed quota exhausted — stopping; re-run when it resets (records embedded so far are kept).");
        break;
      }
    }
  }

  console.log(`  ✔ book_chunks: ${embeddedRecords} records embedded (${totalChunks} chunks), ${failed} failed`);
  return { failed };
}

// Verify final state straight from the DB so we KNOW it worked.
async function verify() {
  console.log("\n── Final state (live from DB) ──");
  for (const job of JOBS) {
    const { count: total } = await db
      .from(job.table)
      .select("id", { count: "exact", head: true });
    const { count: missing } = await db
      .from(job.table)
      .select("id", { count: "exact", head: true })
      .is("embedding", null);
    const ok = (missing ?? 0) === 0;
    console.log(`  ${ok ? "✔" : "✖"} ${job.table}: ${(total ?? 0) - (missing ?? 0)}/${total ?? 0} embedded`);
  }

  try {
    const [pageKeys, chunkedKeys] = await Promise.all([
      fetchRecordKeys("book_pages"),
      fetchRecordKeys("book_chunks"),
    ]);
    const { count: chunkCount } = await db
      .from("book_chunks")
      .select("id", { count: "exact", head: true });
    const ok = [...pageKeys].every((k) => chunkedKeys.has(k));
    console.log(`  ${ok ? "✔" : "✖"} book_chunks: ${chunkedKeys.size}/${pageKeys.size} extracted records chunk-embedded (${chunkCount ?? 0} chunks)`);
  } catch (err) {
    console.log(`  ✖ book_chunks: verify failed — ${err instanceof Error ? err.message : err}`);
  }
}

(async () => {
  let totalFailed = 0;
  if (!CHUNKS_ONLY) {
    for (const job of JOBS) {
      const { failed } = await processTable(job);
      totalFailed += failed;
    }
  }
  if (!METADATA_ONLY) {
    try {
      const { failed } = await processChunks();
      totalFailed += failed;
    } catch (err) {
      totalFailed++;
      console.error(`\n✖ chunk phase failed: ${err instanceof Error ? err.message : err}`);
      console.error("  (is migration 0082_chunk_embeddings.sql applied?)");
    }
  }
  await verify();
  if (totalFailed > 0) {
    console.error(`\n⚠ ${totalFailed} update(s) failed — see errors above.`);
    process.exit(1);
  }
  console.log("\n✅ Done. Semantic search is now live.");
  process.exit(0);
})();
