/* scripts/import-embeddings-to-db.ts
 *
 * Staged Embedding Pipeline — Step 2:
 * Reads pre-computed embeddings from data/embeddings/*.json and bulk-inserts
 * them into Supabase book_chunks table.
 *
 * Why this exists:
 *   - 0 API Spend: Pure database bulk write, no calls to Gemini or OpenAI.
 *   - Blazing Fast: Inserts 100+ chunks per second.
 *   - Safe & Idempotent: Skips records already present in book_chunks unless --force.
 *   - Retries transient timeouts (Postgres 57014) on large vector batches.
 *
 * Usage:
 *   npx tsx scripts/import-embeddings-to-db.ts
 *   npx tsx scripts/import-embeddings-to-db.ts --dry-run
 *   npx tsx scripts/import-embeddings-to-db.ts --limit 10
 *   npx tsx scripts/import-embeddings-to-db.ts --record book:<id>
 *   npx tsx scripts/import-embeddings-to-db.ts --force
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddedChunkRecord } from "./export-embeddings-to-json";

const argv = process.argv.slice(2);
const hasFlag = (f: string) => argv.includes(f);
const getArg = (f: string): string | null => {
  const idx = argv.indexOf(f);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const DRY_RUN = hasFlag("--dry-run");
const FORCE = hasFlag("--force");
const LIMIT = Number(getArg("--limit") ?? "0") || 0;
const SPECIFIC_RECORD = getArg("--record");
const BATCH_SIZE = Number(getArg("--batch-size") ?? "40") || 40;
const IN_DIR = path.resolve(process.cwd(), getArg("--dir") ?? "data/embeddings");

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryableDbError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("statement timeout") ||
    m.includes("canceling statement") ||
    m.includes("57014") ||
    m.includes("deadlock detected") ||
    m.includes("could not serialize") ||
    m.includes("connection") ||
    m.includes("timeout")
  );
}

const DB_RETRY_BACKOFFS_MS = [500, 2_000, 6_000];

async function insertChunkBatchWithRetry(
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const { error } = await db.from("book_chunks").insert(rows);
    if (!error) return;
    if (attempt >= DB_RETRY_BACKOFFS_MS.length || !isRetryableDbError(error.message)) {
      throw new Error(error.message);
    }
    await sleep(DB_RETRY_BACKOFFS_MS[attempt]);
  }
}

async function fetchChunkedKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const SCAN = 1000;
  for (let from = 0; ; from += SCAN) {
    const { data, error } = await db
      .from("book_chunks")
      .select("record_type, record_id")
      .order("id", { ascending: true })
      .range(from, from + SCAN - 1);
    if (error) throw new Error(`book_chunks scan failed: ${error.message}`);
    for (const r of data ?? []) keys.add(`${r.record_type}:${r.record_id}`);
    if (!data || data.length < SCAN) break;
  }
  return keys;
}

async function main() {
  console.log(`\n📥 Staged Embedding Importer (from JSON to Supabase)`);
  console.log(`── Target Database: ${SUPABASE_URL} ──`);
  console.log(`── Source directory: ${IN_DIR} ──`);
  if (DRY_RUN) console.log(`🔍 DRY-RUN MODE: No database records will be modified.\n`);

  if (!fs.existsSync(IN_DIR)) {
    console.log(`Directory ${IN_DIR} does not exist yet. No JSON files to import.`);
    return;
  }

  const allFiles = fs.readdirSync(IN_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Found ${allFiles.length} JSON file(s) in ${IN_DIR}.`);

  if (allFiles.length === 0) {
    console.log("No embedding JSON files found. Run scripts/export-embeddings-to-json.ts first.");
    return;
  }

  process.stdout.write("Checking existing records in book_chunks… ");
  const existingChunkKeys = await fetchChunkedKeys();
  console.log(`found ${existingChunkKeys.size} records already in DB.\n`);

  let filesToImport: string[] = [];
  for (const file of allFiles) {
    const key = file.replace(/\.json$/, "").replace("_", ":");
    if (SPECIFIC_RECORD && key !== SPECIFIC_RECORD) continue;

    if (!FORCE && existingChunkKeys.has(key)) {
      continue;
    }
    filesToImport.push(file);
  }

  filesToImport.sort();
  if (LIMIT > 0) filesToImport = filesToImport.slice(0, LIMIT);

  console.log(`▶ Records to import: ${filesToImport.length} (Skipped ${allFiles.length - filesToImport.length} already in DB)\n`);

  let importedRecords = 0;
  let totalChunksInserted = 0;
  let failedRecords = 0;

  for (let idx = 0; idx < filesToImport.length; idx++) {
    const file = filesToImport[idx];
    const filePath = path.join(IN_DIR, file);

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const record: EmbeddedChunkRecord = JSON.parse(content);
      const key = `${record.record_type}:${record.record_id}`;

      if (!record.chunks || record.chunks.length === 0) {
        console.log(`  [${idx + 1}/${filesToImport.length}] ${key} — skipped (0 chunks in file)`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY-RUN] [${idx + 1}/${filesToImport.length}] ${key} — would insert ${record.chunks.length} chunks (${record.dim} dims)`);
        importedRecords++;
        totalChunksInserted += record.chunks.length;
        continue;
      }

      // If forcing, delete old rows first
      if (FORCE && existingChunkKeys.has(key)) {
        await db
          .from("book_chunks")
          .delete()
          .eq("record_type", record.record_type)
          .eq("record_id", record.record_id);
      }

      process.stdout.write(`  [${idx + 1}/${filesToImport.length}] ${key} — inserting ${record.chunks.length} chunks… `);

      const rows = record.chunks.map((c) => ({
        record_type: record.record_type,
        record_id: record.record_id,
        page_no: c.page_no,
        chunk_no: c.chunk_no,
        content: c.content,
        embedding: c.embedding,
      }));

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const slice = rows.slice(i, i + BATCH_SIZE);
        await insertChunkBatchWithRetry(slice);
        process.stdout.write(`\r  [${idx + 1}/${filesToImport.length}] ${key} — inserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} chunks… `);
      }

      importedRecords++;
      totalChunksInserted += rows.length;
      console.log(`\r  ✔ [${idx + 1}/${filesToImport.length}] ${key} — imported ${rows.length} chunks to book_chunks`);
    } catch (err) {
      failedRecords++;
      console.error(`\n  ✖ [${idx + 1}/${filesToImport.length}] ${file} — FAILED:`, (err as Error).message);
    }
  }

  console.log(`\n========================================`);
  console.log(`🎉 Import Summary:`);
  console.log(`   Imported Records: ${importedRecords}`);
  console.log(`   Total Chunks Written: ${totalChunksInserted}`);
  console.log(`   Failed Records: ${failedRecords}`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error("Fatal import error:", err);
  process.exit(1);
});
