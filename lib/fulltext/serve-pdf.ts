// lib/fulltext/serve-pdf.ts
//
// Serving a PUBLIC full-text PDF (SEO Phase 3.4/3.7): the open-access thesis
// at /theses/<slug>/fulltext.pdf and the openly licensed journal article at
// /journals/articles/<slug>/fulltext.pdf. What Google Scholar needs of such a
// URL — and what these routes therefore promise — is an anonymous 200 with
// `Content-Type: application/pdf`, `Content-Disposition: inline`, byte
// ranges, and a validator (ETag / Last-Modified) so a recrawl can be a 304.
//
// Whether a record's PDF MAY be public is not decided here; each route asks
// its own rule first (lib/theses/open-access.ts, lib/publications/access.ts)
// and only then calls this.

import "server-only";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { zimaFetch } from "@/lib/zima";
import { fulltextValidators, isNotModified, type FulltextVersion } from "@/lib/fulltext/validators";

export type { FulltextVersion };

/** An R2 object key from a legacy value: a bare key, or an https URL whose
 *  path is the key. */
function r2ObjectKey(fileUrl: string): string {
  if (!fileUrl.startsWith("https://")) return fileUrl;
  try {
    return new URL(fileUrl).pathname.replace(/^\//, "");
  } catch {
    return fileUrl;
  }
}

async function fetchStored(fileUrl: string, range: string | null): Promise<Response | null> {
  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    return zimaFetch(fileUrl, range);
  }
  // Legacy bare R2 key — only when this deployment still holds credentials
  // (the same guard the /api file routes carry: presigning with an empty
  // bucket throws inside the SDK).
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_NAME || !process.env.R2_ACCESS_KEY_ID) return null;
  try {
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: r2ObjectKey(fileUrl) }), {
      expiresIn: 60,
    });
    return fetch(url, { headers: range ? { Range: range } : {} });
  } catch (error) {
    console.error("[fulltext] legacy R2 read failed:", error);
    return null;
  }
}

/**
 * Stream a stored PDF as a public, inline, range-capable response. `head`
 * answers the same headers with no body (a crawler checking the type first).
 */
export async function servePublicPdf(args: {
  request: Request;
  fileUrl: string;
  /** Shown as the saved file's name. */
  filename: string;
  version: FulltextVersion;
  head?: boolean;
}): Promise<Response> {
  const { request, fileUrl, filename, version } = args;
  const validators = fulltextValidators(version);
  if (isNotModified(request.headers, validators)) {
    const headers = new Headers({ "Cache-Control": CACHE_CONTROL });
    if (validators.etag) headers.set("ETag", validators.etag);
    if (validators.lastModified) headers.set("Last-Modified", validators.lastModified);
    return new Response(null, { status: 304, headers });
  }

  const range = args.head ? null : request.headers.get("range");
  const upstream = await fetchStored(fileUrl, range);
  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    return new Response("File not found in storage", { status: 404 });
  }

  const safe = encodeURIComponent(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${safe}"; filename*=UTF-8''${safe}`);
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("Accept-Ranges", "bytes");
  if (validators.etag) headers.set("ETag", validators.etag);
  if (validators.lastModified) headers.set("Last-Modified", validators.lastModified);
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (args.head) {
    await upstream.body?.cancel();
    return new Response(null, { status: 200, headers });
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

/** Public and cacheable: the same bytes for everyone, revalidated hourly. */
const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";
