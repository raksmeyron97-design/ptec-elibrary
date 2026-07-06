/* scripts/extract-pdf-text.ts
 *
 * Backfills book_pages (migration 0066) with per-page text from every
 * published book/thesis PDF, powering "found inside" page hits in
 * /api/search/native. Pages with no extractable text (scanned images) are
 * skipped — those records simply aren't full-text searchable rather than
 * being indexed as garbage. Gemini-OCR for scanned Khmer PDFs is a known
 * possible follow-up, deliberately out of scope here (cost).
 *
 * Idempotent: already-indexed records are skipped unless --all is passed
 * (which re-extracts everything).
 *
 * Run:
 *   npx tsx scripts/extract-pdf-text.ts          # only unindexed records
 *   npx tsx scripts/extract-pdf-text.ts --all    # re-extract everything
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the R2_*
 * vars for legacy bare-key PDFs (same as check-file-health.ts).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const REEXTRACT_ALL = process.argv.includes("--all");
const MAX_PAGE_CHARS = 8000;   // cap outliers; a page of real prose is ~3-4k chars
const MIN_PAGE_CHARS = 20;     // below this it's a blank/scanned page — skip
const INSERT_BATCH = 100;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

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

async function resolveUrl(rawUrl: string): Promise<string | null> {
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
  if (!r2) return null; // legacy bare key but no R2 creds — can't fetch
  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: rawUrl });
    return await getSignedUrl(r2, command, { expiresIn: 300 });
  } catch {
    return null;
  }
}

type Target = { recordType: "book" | "research"; recordId: string; title: string; rawUrl: string };

async function extractPages(bytes: ArrayBuffer): Promise<{ pageNo: number; content: string }[]> {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pages: { pageNo: number; content: string }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((i: any) => (typeof i.str === "string" ? i.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= MIN_PAGE_CHARS) {
      pages.push({ pageNo: p, content: text.slice(0, MAX_PAGE_CHARS) });
    }
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

async function main() {
  const [{ data: books }, { data: theses }, { data: indexed }] = await Promise.all([
    db.from("books").select("id, title, book_files(file_url)").eq("is_published", true),
    db.from("research_reports").select("id, title, file_url").eq("is_published", true),
    REEXTRACT_ALL
      ? Promise.resolve({ data: [] as { record_type: string; record_id: string }[] })
      : db.from("book_pages").select("record_type, record_id"),
  ]);

  const alreadyIndexed = new Set((indexed ?? []).map((r) => `${r.record_type}:${r.record_id}`));

  const targets: Target[] = [];
  for (const b of books ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfUrl = (b.book_files as any[])?.find((f) => f.file_url)?.file_url;
    if (pdfUrl && !alreadyIndexed.has(`book:${b.id}`)) {
      targets.push({ recordType: "book", recordId: b.id, title: b.title, rawUrl: pdfUrl });
    }
  }
  for (const r of theses ?? []) {
    if (r.file_url && !alreadyIndexed.has(`research:${r.id}`)) {
      targets.push({ recordType: "research", recordId: r.id, title: r.title, rawUrl: r.file_url });
    }
  }

  console.log(`${targets.length} records to extract (${alreadyIndexed.size ? `${alreadyIndexed.size / 1} already indexed, skipped` : "fresh run"})…`);

  let done = 0, indexedCount = 0, skippedNoText = 0, failed = 0, totalPages = 0;
  for (const t of targets) {
    done++;
    const label = `[${done}/${targets.length}] ${t.title.slice(0, 50)}`;
    try {
      const url = await resolveUrl(t.rawUrl);
      if (!url) { console.log(`${label} — SKIP (unresolvable URL)`); failed++; continue; }

      const res = await fetch(url);
      if (!res.ok) { console.log(`${label} — SKIP (fetch ${res.status})`); failed++; continue; }

      const pages = await extractPages(await res.arrayBuffer());
      if (pages.length === 0) { console.log(`${label} — no text layer (scanned?)`); skippedNoText++; continue; }

      // Idempotent: replace any existing rows for this record.
      await db.from("book_pages").delete().eq("record_type", t.recordType).eq("record_id", t.recordId);
      for (let i = 0; i < pages.length; i += INSERT_BATCH) {
        const batch = pages.slice(i, i + INSERT_BATCH).map((p) => ({
          record_type: t.recordType,
          record_id: t.recordId,
          page_no: p.pageNo,
          content: p.content,
        }));
        const { error } = await db.from("book_pages").insert(batch);
        if (error) throw new Error(error.message);
      }
      totalPages += pages.length;
      indexedCount++;
      console.log(`${label} — ${pages.length} pages`);
    } catch (err) {
      failed++;
      console.log(`${label} — FAILED: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
  }

  console.log(`\nDone. ${indexedCount} records indexed (${totalPages} pages), ${skippedNoText} had no text layer, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
