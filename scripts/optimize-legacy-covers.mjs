// scripts/optimize-legacy-covers.mjs
// One-off data repair: legacy R2 book covers uploaded before the sharp
// upload-time optimizer (lib/image-optimize.ts) are full-size originals —
// the 2026-07-06 production Lighthouse run measured 1.26 MB of covers on the
// homepage (one cover alone was 582 KB) and they are the page's LCP ceiling.
//
//   node scripts/optimize-legacy-covers.mjs            dry run (report only)
//   node scripts/optimize-legacy-covers.mjs --apply    upload + update DB
//
// Strategy (reversible):
//   1. find published books whose cover_url points at the legacy R2 public
//      bucket and transfers > SIZE_LIMIT bytes
//   2. download → sharp → WebP, max 800px wide, q75 (same recipe as
//      BOOK_COVER_OPTS in lib/image-optimize.ts)
//   3. upload alongside the original as <original-path>-opt.webp (the
//      original object is NOT touched — it remains the rollback)
//   4. point books.cover_url at the new object via PostgREST
//
// Requires .env: R2_* creds, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { readFileSync } from "node:fs";

// Minimal .env loader (script runs outside Next).
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=["']?([^"'\n]*)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const APPLY = process.argv.includes("--apply");
const SIZE_LIMIT = 150 * 1024; // covers larger than this get re-encoded
const COVERS_HOST = "pub-859a15e085144721b664647523d5ccff.r2.dev";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.R2_PUBLIC_BUCKET_NAME;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function rest(path, init = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const books = await rest(
  `/books?select=id,slug,cover_url&is_published=eq.true&cover_url=like.*${COVERS_HOST}*`
);
console.log(`${books.length} published books with legacy R2 covers`);

let touched = 0;
for (const book of books) {
  const res = await fetch(book.cover_url);
  if (!res.ok) {
    console.warn(`  SKIP (${res.status}): ${book.slug}`);
    continue;
  }
  const original = Buffer.from(await res.arrayBuffer());
  if (original.length <= SIZE_LIMIT) continue;

  const optimized = await sharp(original)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();

  const key = new URL(book.cover_url).pathname.replace(/^\//, "") + "-opt.webp";
  const newUrl = `https://${COVERS_HOST}/${key}`;
  console.log(
    `  ${book.slug}: ${(original.length / 1024).toFixed(0)} KB → ${(optimized.length / 1024).toFixed(0)} KB` +
      (APPLY ? "  [uploading]" : "  [dry run]")
  );

  if (APPLY) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: optimized,
        ContentType: "image/webp",
        CacheControl: "public, max-age=2678400",
      })
    );
    await rest(`/books?id=eq.${book.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cover_url: newUrl }),
      headers: { Prefer: "return=minimal" },
    });
  }
  touched++;
}

console.log(
  `\n${APPLY ? "updated" : "would update"} ${touched} covers.` +
    (APPLY ? "" : "  Re-run with --apply to execute.")
);
