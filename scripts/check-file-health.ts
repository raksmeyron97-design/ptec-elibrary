/* scripts/check-file-health.ts
 *
 * HEAD-checks every published book/thesis file_url and cover_url, and
 * upserts the result into file_health (migration 0065). Read by the
 * /admin/data-quality dashboard's "Broken files" section.
 *
 * This is deliberately an out-of-band job, not a request-path check — a
 * library-wide link sweep has no business running on a page load.
 *
 * book_files.file_url has two shapes (mirrors the branching in
 * /api/books/[slug]/download/route.ts — keep both in sync):
 *   - a full https:// URL (Zima CDN, or legacy public R2 bucket)   → HEAD it directly
 *   - a bare object key, e.g. "books/book-.../book.pdf"            → legacy PRIVATE R2
 *     bucket; not fetchable as-is, needs a presigned GetObject URL first
 * Covers and thesis file_urls are always full URLs (verified against the
 * live DB before writing this) so they never need the presigning branch.
 *
 * Run:
 *   npx tsx scripts/check-file-health.ts
 *
 * Env (.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *     (only needed if any book still has a legacy bare-key file_url)
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;

const r2 = process.env.R2_ACCOUNT_ID
  ? new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

/** Bare legacy R2 object key → a short-lived presigned URL that's actually fetchable. */
async function presignLegacyKey(key: string): Promise<string | null> {
  if (!r2) return null;
  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key });
    return await getSignedUrl(r2, command, { expiresIn: 60 });
  } catch {
    return null;
  }
}

type Target = { recordType: "book" | "research"; recordId: string; field: "file_url" | "cover_url"; url: string };

async function checkUrl(rawUrl: string): Promise<{ status: "ok" | "broken" | "unknown"; httpStatus: number | null }> {
  const isFullUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
  const url = isFullUrl ? rawUrl : await presignLegacyKey(rawUrl);

  if (!url) {
    // Bare key but no R2 credentials configured to presign it — can't check, don't guess.
    return { status: "unknown", httpStatus: null };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    if (isFullUrl) {
      // Some CDNs/storage backends reject HEAD outright — fall back to a ranged GET.
      res = await fetch(url, { method: "HEAD", signal: controller.signal });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: controller.signal });
      }
    } else {
      // R2 presigned GetObject URLs are signed for GET specifically — a HEAD
      // against one comes back 403 (verified directly against the live
      // bucket), so never attempt HEAD here.
      res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: controller.signal });
    }
    clearTimeout(timer);
    return { status: res.ok ? "ok" : "broken", httpStatus: res.status };
  } catch {
    return { status: "broken", httpStatus: null };
  }
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number) {
  let cursor = 0;
  async function next(): Promise<void> {
    const i = cursor++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: concurrency }, next));
}

async function main() {
  console.log("Fetching published books and theses…");

  const [{ data: books }, { data: theses }] = await Promise.all([
    db.from("books").select("id, cover_url, book_files(file_url)").eq("is_published", true),
    db.from("research_reports").select("id, cover_url, file_url").eq("is_published", true),
  ]);

  const targets: Target[] = [];
  for (const b of books ?? []) {
    if (b.cover_url) targets.push({ recordType: "book", recordId: b.id, field: "cover_url", url: b.cover_url });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfUrl = (b.book_files as any[])?.find((f) => f.file_url)?.file_url;
    if (pdfUrl) targets.push({ recordType: "book", recordId: b.id, field: "file_url", url: pdfUrl });
  }
  for (const r of theses ?? []) {
    if (r.cover_url) targets.push({ recordType: "research", recordId: r.id, field: "cover_url", url: r.cover_url });
    if (r.file_url) targets.push({ recordType: "research", recordId: r.id, field: "file_url", url: r.file_url });
  }

  console.log(`Checking ${targets.length} URLs (concurrency ${CONCURRENCY})…`);

  let ok = 0, broken = 0, unknown = 0, done = 0;
  await runPool(
    targets,
    async (t) => {
      const result = await checkUrl(t.url);
      if (result.status === "ok") ok++;
      else if (result.status === "unknown") unknown++;
      else broken++;
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${targets.length}…`);

      const { error } = await db.from("file_health").upsert(
        {
          record_type: t.recordType,
          record_id: t.recordId,
          field: t.field,
          url: t.url,
          status: result.status,
          http_status: result.httpStatus,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "record_type,record_id,field" },
      );
      if (error) console.error(`  ✖ upsert failed for ${t.recordType}/${t.recordId}/${t.field}:`, error.message);
    },
    CONCURRENCY,
  );

  console.log(`\nDone. ${ok} ok, ${broken} broken, ${unknown} unknown (couldn't be checked), out of ${targets.length} total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
