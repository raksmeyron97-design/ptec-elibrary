/* scripts/export-embeddings-to-json.ts
 *
 * Staged Embedding Pipeline — Step 1:
 * Computes semantic embeddings for book chunks and saves them to local JSON
 * files under data/embeddings/.
 *
 * Why this exists:
 * Decouples the slow/metered AI embedding generation from the database write:
 *   1. Zero loss on failure: Each record is written to its own JSON file on disk
 *      as soon as it finishes. Network timeouts, DB locks, or API rate limits
 *      never strand or lose completed vectors.
 *   2. Inspection & Verification: JSON files can be inspected and verified
 *      offline before touching the production database.
 *   3. Re-usable backup: The generated JSON embeddings serve as a permanent,
 *      free backup for restoring search vectors without re-paying Google API.
 *
 * Usage:
 *   npx tsx scripts/export-embeddings-to-json.ts
 *   npx tsx scripts/export-embeddings-to-json.ts --limit 5
 *   npx tsx scripts/export-embeddings-to-json.ts --record book:<id>
 *   npx tsx scripts/export-embeddings-to-json.ts --key <gemini-api-key>
 *   npx tsx scripts/export-embeddings-to-json.ts --force
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chunkPages } from "../lib/chunk-embed";
import { EMBEDDING_DIM, EMBEDDING_MODEL, EMBEDDING_PROVIDER } from "../lib/ai/models";
import { getAIProvider } from "../lib/ai/provider";
import type { PageRecordType } from "../lib/pdf-page-index";

// ── CLI argument parsing ───────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (f: string) => argv.includes(f);
const getArg = (f: string): string | null => {
  const idx = argv.indexOf(f);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
};

// Override GEMINI_API_KEY if passed via CLI
const customKey = getArg("--key");
if (customKey) {
  process.env.GEMINI_API_KEY = customKey;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const provider = getAIProvider();

if (!SUPABASE_URL || !SERVICE_KEY || !provider.embeddingsConfigured()) {
  console.error(
    "✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY.",
  );
  process.exit(1);
}

const LIMIT = Number(getArg("--limit") ?? "0") || 0;
const SPECIFIC_RECORD = getArg("--record"); // e.g. "book:<uuid>"
const FORCE_REDO = hasFlag("--force");
const OUT_DIR = path.resolve(process.cwd(), getArg("--dir") ?? "data/embeddings");

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BATCH_SIZE = 16;
const BATCH_DELAY_MS = 250;
const QUOTA_BACKOFFS_MS = [2_000, 35_000, 65_000];

function isDailyQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /perday|spending cap|resource_exhausted/i.test(msg);
}

function retryDelayMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/retryDelay[^0-9]*(\d+)/i);
  return m ? Number(m[1]) * 1000 : null;
}

async function embedWithBackoff(texts: string[]): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      const vecs = await provider.generateEmbedding(texts);
      await sleep(BATCH_DELAY_MS);
      return vecs;
    } catch (err) {
      lastErr = err;
      if (isDailyQuotaError(err) || attempt >= QUOTA_BACKOFFS_MS.length) break;
      const delay = retryDelayMs(err) ?? QUOTA_BACKOFFS_MS[attempt];
      process.stdout.write(`\n  ⚠ Rate limit hit; waiting ${Math.round(delay / 1000)}s… `);
      await sleep(delay);
    }
  }
  throw lastErr;
}

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

async function fetchRecordPages(
  recordType: PageRecordType,
  recordId: string,
): Promise<{ pageNo: number; content: string }[]> {
  const pages: { pageNo: number; content: string }[] = [];
  const PAGE_FETCH = 500;
  for (let from = 0; ; from += PAGE_FETCH) {
    const { data, error } = await db
      .from("book_pages")
      .select("page_no, content")
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .order("page_no", { ascending: true })
      .range(from, from + PAGE_FETCH - 1);
    if (error) throw new Error(`book_pages fetch failed: ${error.message}`);
    for (const row of data ?? []) pages.push({ pageNo: row.page_no, content: row.content });
    if (!data || data.length < PAGE_FETCH) break;
  }
  return pages;
}

export type EmbeddedChunkRecord = {
  record_type: string;
  record_id: string;
  total_pages: number;
  total_chunks: number;
  model: string;
  dim: number;
  exported_at: string;
  chunks: Array<{
    page_no: number;
    chunk_no: number;
    content: string;
    embedding: number[];
  }>;
};

function recordFilePath(recordType: string, recordId: string): string {
  return path.join(OUT_DIR, `${recordType}_${recordId}.json`);
}

async function main() {
  console.log(`\n📦 Staged Embedding Exporter (to JSON)`);
  console.log(`── Backend: ${EMBEDDING_PROVIDER} / ${EMBEDDING_MODEL} @ ${EMBEDDING_DIM} dims ──`);
  console.log(`── Output directory: ${OUT_DIR} ──\n`);

  // Probe dimension first
  const [probe] = await provider.generateEmbedding(["probe"]);
  if (probe.length !== EMBEDDING_DIM) {
    throw new Error(`Dimension mismatch: expected ${EMBEDDING_DIM}, got ${probe.length}`);
  }
  console.log(`✔ Provider probe passed (${EMBEDDING_DIM} dimensions)\n`);

  let targetKeys: string[] = [];
  if (SPECIFIC_RECORD) {
    targetKeys = [SPECIFIC_RECORD];
  } else {
    process.stdout.write("Scanning records in book_pages and book_chunks… ");
    const [pageKeys, chunkedKeys] = await Promise.all([
      fetchRecordKeys("book_pages"),
      fetchRecordKeys("book_chunks"),
    ]);
    console.log(`found ${pageKeys.size} extracted books (${chunkedKeys.size} already in DB).`);

    // Only target books that need embedding or don't have a JSON file yet
    for (const key of pageKeys) {
      const [type, id] = key.split(":");
      const filePath = recordFilePath(type, id);
      const jsonExists = fs.existsSync(filePath);

      if (FORCE_REDO || (!jsonExists && !chunkedKeys.has(key))) {
        targetKeys.push(key);
      }
    }
  }

  targetKeys.sort();
  if (LIMIT > 0) targetKeys = targetKeys.slice(0, LIMIT);

  console.log(`▶ Targets to process: ${targetKeys.length} records\n`);

  let doneCount = 0;
  let skippedCount = 0;
  let totalChunksExported = 0;

  for (const key of targetKeys) {
    doneCount++;
    const [recordType, recordId] = key.split(":") as [PageRecordType, string];
    const outPath = recordFilePath(recordType, recordId);

    if (fs.existsSync(outPath) && !FORCE_REDO) {
      console.log(`  [${doneCount}/${targetKeys.length}] ${key} — skipped (JSON already exists)`);
      skippedCount++;
      continue;
    }

    try {
      const pages = await fetchRecordPages(recordType, recordId);
      if (pages.length === 0) {
        console.log(`  [${doneCount}/${targetKeys.length}] ${key} — skipped (no pages extracted)`);
        continue;
      }

      const chunks = chunkPages(pages);
      if (chunks.length === 0) {
        console.log(`  [${doneCount}/${targetKeys.length}] ${key} — skipped (no chunkable content)`);
        continue;
      }

      process.stdout.write(`  [${doneCount}/${targetKeys.length}] ${key} — embedding ${chunks.length} chunks… `);

      const embeddedChunks: EmbeddedChunkRecord["chunks"] = [];
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const slice = chunks.slice(i, i + BATCH_SIZE);
        const vectors = await embedWithBackoff(slice.map((c) => c.content));

        slice.forEach((chunk, k) => {
          embeddedChunks.push({
            page_no: chunk.pageNo,
            chunk_no: chunk.chunkNo,
            content: chunk.content,
            embedding: vectors[k],
          });
        });
        process.stdout.write(`\r  [${doneCount}/${targetKeys.length}] ${key} — ${embeddedChunks.length}/${chunks.length} chunks… `);
      }

      const recordData: EmbeddedChunkRecord = {
        record_type: recordType,
        record_id: recordId,
        total_pages: pages.length,
        total_chunks: embeddedChunks.length,
        model: EMBEDDING_MODEL,
        dim: EMBEDDING_DIM,
        exported_at: new Date().toISOString(),
        chunks: embeddedChunks,
      };

      // Write atomically via temporary file
      const tmpPath = `${outPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(recordData, null, 2), "utf8");
      fs.renameSync(tmpPath, outPath);

      totalChunksExported += embeddedChunks.length;
      console.log(`\r  ✔ [${doneCount}/${targetKeys.length}] ${key} — exported ${embeddedChunks.length} chunks to JSON`);
    } catch (err) {
      console.error(`\n  ✖ [${doneCount}/${targetKeys.length}] ${key} — FAILED:`, (err as Error).message);
      if (isDailyQuotaError(err)) {
        console.error("\n✖ Gemini API quota / spending cap limit reached. Stopping gracefully.");
        console.error("  All records exported so far are safely preserved in data/embeddings/.");
        console.error("  You can re-run this script anytime when quota resets or with a new key.\n");
        break;
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`🎉 Export Summary:`);
  console.log(`   Processed: ${doneCount}/${targetKeys.length}`);
  console.log(`   Skipped (JSON already present): ${skippedCount}`);
  console.log(`   Total Chunks Exported: ${totalChunksExported}`);
  console.log(`   Files directory: ${OUT_DIR}`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error("Fatal export error:", err);
  process.exit(1);
});
