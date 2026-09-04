/* eslint-disable @typescript-eslint/no-explicit-any */
// Inline PDF delivery for the in-app reader.
//
// PERFORMANCE SHAPE. pdf.js reads a book in byte ranges, so this handler is hit
// many times for one book — it is a hot path, not a one-shot download. Two
// things follow, and both are load-bearing:
//
//   * The book row is read through a tagged cache, not a query per chunk.
//     It changes when an admin saves the book, and every book mutation already
//     revalidates the `books` tag.
//   * A ranged continuation of an already-authorized read is metered against
//     `fileRange`, not `fileRead`. Counting each 512 KB of one open document as
//     a fresh "file read" made a reader exceed their own limit, and get a 429,
//     partway through opening a large book.
//
// What is NOT cached or relaxed: the session check. `auth.getUser()` runs on
// every request, so revoking a session stops the next chunk.
//
// See docs/LARGE-PDF-PERFORMANCE-AUDIT.md for the measurements behind this.
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { zimaFetch } from "@/lib/zima";
import { clientIp } from "@/lib/client-ip";
import { isVerifiedGoogleCrawler } from "@/lib/security/crawler";
import { placeholderPdfResponse } from "@/lib/dev/placeholder-pdf";
import { lockdownResponse } from "@/lib/security/lockdown";

// Legacy R2 client — kept for backward compat with bare-key records in the DB.
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

function r2ObjectKey(fileUrl: string): string {
  if (!fileUrl.startsWith("https://")) return fileUrl;
  try {
    return new URL(fileUrl).pathname.replace(/^\//, "");
  } catch {
    return fileUrl;
  }
}

/**
 * The book's identity and file location, cached under the `books` tag.
 *
 * Only fields that decide *where the bytes are and whether they may be served*
 * — nothing user-specific ever enters this cache.
 */
const getBookFileRecord = unstable_cache(
  async (bookId: string) => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("books")
      .select(`title, book_files ( file_url, format )`)
      .eq("id", bookId)
      .eq("is_published", true)
      .maybeSingle();
    if (error || !data) return null;
    const files = Array.isArray(data.book_files) ? data.book_files : [data.book_files];
    const pdfFile = files.find((f: any) => f?.format === "pdf") ?? files[0];
    return {
      title: data.title as string,
      fileUrl: (pdfFile?.file_url as string | undefined) ?? null,
    };
  },
  ["book-file-record"],
  { revalidate: 3600, tags: ["books"] },
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const locked = lockdownResponse("downloads", "/api/books/[slug]/file");
  if (locked) return locked;

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";

  // Any `?download=1` request is funnelled to the single authoritative gated
  // route, which enforces the per-book download policy (0131), counts the
  // download exactly once, and streams with `private, no-store`.
  //
  // This route used to answer `?download=1` itself with an `attachment`
  // disposition. That made it a second, ungated download path — the one the
  // search results linked at — so a book's download policy could be sidestepped
  // by a query parameter. Redirecting rather than re-implementing is what keeps
  // there being exactly one gate. The redirect happens BEFORE any database or
  // storage work, so the bypass costs nothing to refuse.
  if (download) {
    // A RELATIVE Location, deliberately.
    //
    // `new URL(path, request.url)` resolves against the origin the SERVER sees,
    // which behind the Cloudflare Tunnel is the container's own bind address —
    // it shipped `Location: https://0.0.0.0:3000/...`, which no browser can
    // follow. This is the rule in CLAUDE.md ("redirect origins are never taken
    // from the request") in its least obvious form.
    //
    // A relative reference is resolved by the CLIENT against the URL it
    // actually requested (RFC 7231 §7.1.2), so it needs no origin at all: it
    // lands on the canonical host for a public visitor, and on the LAN address
    // for someone debugging over http — which is also the host that holds
    // their session cookie. `NextResponse.redirect` requires an absolute URL,
    // so the header is set directly.
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: `/api/books/${encodeURIComponent(slug)}/download`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const ip = clientIp(request.headers);
  const rangeHeader = request.headers.get("range");

  // A ranged request continues a document the caller already opened; an
  // unranged one opens it. Different events, different ceilings, different
  // buckets — see ratePolicy("fileRange").
  const isRangeRequest = !!rangeHeader;
  const { limit, windowMs } = ratePolicy(isRangeRequest ? "fileRange" : "fileRead");
  const rl = await rateLimit(
    `${isRangeRequest ? "book-file-range" : "book-file"}:${ip}`,
    limit,
    windowMs,
  );
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/books/[slug]/file", ip });
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Both inline viewing and downloading require a signed-in reader, so access
  // to book PDFs is tied to a user (tracking). The one exception is a
  // DNS-verified Google crawler: published books are public content, and the
  // Google Scholar `citation_pdf_url` must resolve for full-text indexing.
  // A spoofed User-Agent can't pass isVerifiedGoogleCrawler (rDNS + forward
  // confirm), so this is not a gate bypass for ordinary anonymous callers.
  if (!user) {
    const verifiedCrawler = await isVerifiedGoogleCrawler(ip, request.headers.get("user-agent"));
    if (!verifiedCrawler) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const book = await getBookFileRecord(slug);
  if (!book) {
    return new NextResponse("Book not found", { status: 404 });
  }
  if (!book.fileUrl) {
    return new NextResponse("File not found", { status: 404 });
  }

  const fileUrl = book.fileUrl;
  const safeTitle = encodeURIComponent(`${book.title}.pdf`);
  // Always inline. `attachment` is the gated /download route's business now;
  // reinstating it here would recreate the bypass the redirect above closed.
  const disposition = `inline; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;

  // NOTE — there used to be a @vercel/blob branch here for records whose
  // file_url pointed at *.blob.vercel-storage.com. It is gone with the move to
  // self-hosting: that SDK reads a Vercel-issued token this deployment no
  // longer holds, so it could only ever have failed at runtime. Public blob
  // URLs still work, because the generic HTTP proxy below handles them like
  // any other absolute URL; a private one 404s with the same message as any
  // other unreachable object. Book files live in Zima Storage now.

  // ── Zima CDN or any full HTTP(S) URL — fetch & proxy server-side ─
  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    const upstream = await zimaFetch(fileUrl, rangeHeader);
    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse("File not found in storage", { status: 404 });
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    headers.set("Accept-Ranges", "bytes");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    return new NextResponse(upstream.body, { headers, status: upstream.status });
  }

  // ── Legacy: bare R2 object key (private bucket) ────────────────
  //
  // R2 is the legacy fallback — Zima is primary — so a deployment can quite
  // reasonably hold no R2 credentials at all, and every local checkout leaves
  // those vars EMPTY. Presigning with an empty bucket throws
  // `No value provided for input HTTP label: Bucket` deep inside the AWS SDK,
  // and the throw escaped as an unhandled 500 with a stack trace: both an
  // unhelpful answer and a worse one than the truth, which is simply that this
  // route cannot produce the file. Everything below resolves to the same
  // honest 404 the Zima branch already returns for an object storage lacks.
  // (Mirrors the guard app/api/publications/[slug]/file/route.ts already had.)
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_NAME || !process.env.R2_ACCESS_KEY_ID) {
    // Development only, and only once real storage has been ruled out: serve a
    // labelled placeholder so the reader can be opened by hand against the
    // seeded book, whose file_url points at an object no local store holds.
    const placeholder = placeholderPdfResponse({
      title: book.title,
      rangeHeader,
      disposition,
      source: "books/file",
    });
    if (placeholder) return placeholder;
    console.warn(`[books/file] legacy R2 key "${fileUrl}" but R2 is not configured`);
    return new NextResponse("File not found in storage", { status: 404 });
  }

  const fetchHeaders: HeadersInit = {};
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  let r2Res: Response;
  try {
    const key = r2ObjectKey(fileUrl);
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
    r2Res = await fetch(presignedUrl, { headers: fetchHeaders });
  } catch (storageError) {
    console.error("[books/file] legacy R2 read failed:", storageError);
    return new NextResponse("File not found in storage", { status: 404 });
  }

  if (!r2Res.ok && r2Res.status !== 206) {
    return new NextResponse("File not found in storage", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  headers.set("Accept-Ranges", "bytes");

  const contentLength = r2Res.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  const contentRange = r2Res.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  return new NextResponse(r2Res.body, { headers, status: r2Res.status });
}
