/**
 * scripts/migrate-covers.ts
 *
 * One-off idempotent script that copies existing cover images from the
 * (now-private) original R2 bucket to the new public covers bucket and
 * rewrites the cover_url columns in Supabase.
 *
 * Run with:
 *   npx tsx scripts/migrate-covers.ts
 *
 * Safe to re-run: rows already pointing at NEXT_PUBLIC_R2_COVERS_URL are
 * skipped. External URLs (e.g. Amazon, Open Library) are left untouched.
 *
 * DO NOT make the original bucket private until after this script succeeds
 * and covers are verified loading from the new domain.
 */

import * as dotenv from "dotenv";
import { S3Client, CopyObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

// Load .env / .env.local
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// ── Env ───────────────────────────────────────────────────────────────────────

const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const OLD_BUCKET          = process.env.R2_BUCKET_NAME!;
const NEW_BUCKET          = process.env.R2_PUBLIC_BUCKET_NAME!;
const OLD_BASE            = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
const NEW_BASE            = (process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "").replace(/\/$/, "");

for (const [name, val] of Object.entries({ SUPABASE_URL, SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, OLD_BUCKET, NEW_BUCKET, OLD_BASE, NEW_BASE })) {
  if (!val) { console.error(`Missing env var: ${name}`); process.exit(1); }
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAlreadyMigrated(url: string): boolean {
  return url.startsWith(NEW_BASE + "/");
}

function isOldBucketUrl(url: string): boolean {
  return url.startsWith(OLD_BASE + "/");
}

function keyFromOldUrl(url: string): string {
  return url.slice(OLD_BASE.length + 1);
}

function newUrl(key: string): string {
  return `${NEW_BASE}/${key}`;
}

/** Copy one object from OLD_BUCKET to NEW_BUCKET, same key. */
async function copyToPublicBucket(key: string): Promise<void> {
  // CopySource must be URL-encoded for special characters in keys
  const copySource = `${OLD_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  await s3.send(
    new CopyObjectCommand({
      Bucket: NEW_BUCKET,
      CopySource: copySource,
      Key: key,
    }),
  );
}

// ── Per-row processor ─────────────────────────────────────────────────────────

type Stats = { copied: number; skipped: number; failed: number };

async function migrateField(
  table: string,
  idField: string,
  urlField: string,
  stats: Stats,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from(table)
    .select(`${idField}, ${urlField}`)
    .not(urlField, "is", null);

  if (error) {
    console.error(`[${table}] fetch error:`, error.message);
    stats.failed++;
    return;
  }

  for (const row of rows ?? []) {
    const url: string | null = (row as unknown as Record<string, string | null>)[urlField];
    if (!url) { stats.skipped++; continue; }

    if (isAlreadyMigrated(url)) { stats.skipped++; continue; }

    if (!isOldBucketUrl(url)) {
      // External URL (Amazon, Open Library, Google Drive, etc.) — leave alone
      stats.skipped++;
      continue;
    }

    const key = keyFromOldUrl(url);
    try {
      await copyToPublicBucket(key);
      const rowId = (row as unknown as Record<string, unknown>)[idField];
      const { error: updateErr } = await supabase
        .from(table)
        .update({ [urlField]: newUrl(key) })
        .eq(idField, rowId);

      if (updateErr) throw updateErr;
      console.log(`  ✓ [${table}] ${key}`);
      stats.copied++;
    } catch (err: any) {
      console.error(`  ✗ [${table}] ${key}:`, err?.message ?? err);
      stats.failed++;
    }
  }
}

/** posts.cover_urls is text[] — handle each element in the array. */
async function migratePostsCoverUrls(stats: Stats): Promise<void> {
  const { data: rows, error } = await supabase
    .from("posts")
    .select("id, cover_urls")
    .not("cover_urls", "is", null);

  if (error) {
    console.error("[posts.cover_urls] fetch error:", error.message);
    stats.failed++;
    return;
  }

  for (const row of rows ?? []) {
    const urls: string[] = row.cover_urls ?? [];
    if (urls.length === 0) { stats.skipped++; continue; }

    let changed = false;
    const newUrls = urls.map((url) => {
      if (!url || isAlreadyMigrated(url) || !isOldBucketUrl(url)) return url;
      changed = true;
      return newUrl(keyFromOldUrl(url));
    });

    if (!changed) { stats.skipped++; continue; }

    // Copy each changed URL
    for (let i = 0; i < urls.length; i++) {
      if (urls[i] === newUrls[i]) continue;
      const key = keyFromOldUrl(urls[i]);
      try {
        await copyToPublicBucket(key);
        console.log(`  ✓ [posts.cover_urls] ${key}`);
        stats.copied++;
      } catch (err: any) {
        console.error(`  ✗ [posts.cover_urls] ${key}:`, err?.message ?? err);
        stats.failed++;
        newUrls[i] = urls[i]; // revert this entry on failure
      }
    }

    const { error: updateErr } = await supabase
      .from("posts")
      .update({ cover_urls: newUrls })
      .eq("id", row.id);

    if (updateErr) {
      console.error(`  ✗ [posts.cover_urls] update row ${row.id}:`, updateErr.message);
      stats.failed++;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Cover migration: old bucket → public bucket ===");
  console.log(`  OLD: ${OLD_BASE}  (bucket: ${OLD_BUCKET})`);
  console.log(`  NEW: ${NEW_BASE}  (bucket: ${NEW_BUCKET})`);
  console.log("");

  const stats: Stats = { copied: 0, skipped: 0, failed: 0 };

  const tasks: Array<[string, string, string]> = [
    ["books",            "id", "cover_url"],
    ["catalog_books",    "id", "cover_url"],
    ["research_reports", "id", "cover_url"],
    ["posts",            "id", "cover_url"],
  ];

  for (const [table, id, field] of tasks) {
    console.log(`→ ${table}.${field}`);
    await migrateField(table, id, field, stats);
  }

  console.log("\n→ posts.cover_urls (array)");
  await migratePostsCoverUrls(stats);

  console.log("\n=== Summary ===");
  console.log(`  Copied:  ${stats.copied}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Failed:  ${stats.failed}`);

  if (stats.failed > 0) {
    console.error("\nSome rows failed. Fix them before making the original bucket private.");
    process.exit(1);
  } else {
    console.log("\nAll done. Verify covers load, then make the original bucket private.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
