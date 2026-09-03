import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requirePermission, requireStaff } from "@/lib/auth/requireAdmin";
import { uploadPermissionResource } from "@/lib/storage/permission-resource";
import { resolveUploadType } from "@/lib/mime-validation";
import { sha256Hex, findDuplicatePdf } from "@/lib/content-hash";
import { zimaUpload, isZimaUploadError } from "@/lib/zima";
import { optimizeImage, BOOK_COVER_OPTS, POST_IMAGE_OPTS } from "@/lib/image-optimize";
import { logSecurityEvent } from "@/lib/security-log";
import { describeStorageKeyError } from "@/lib/storage/folder-name";
import { checkFileHashReputation, isVirusScanFailClosed } from "@/lib/virus-scan";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/uploads/state";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/", "publications/", "paths/"];

// One byte under 100 MiB. Storage refuses EXACTLY 100 MiB, so a cap of
// 100 * 1024 * 1024 here accepted the one size that could never be stored —
// see MAX_UPLOAD_BYTES in lib/uploads/state.ts for the probe.

/** Pick optimization preset based on the upload folder. */
function presetsForFolder(key: string) {
  if (key.startsWith("books/")) return BOOK_COVER_OPTS;
  if (key.startsWith("posts/")) return POST_IMAGE_OPTS;
  return {}; // default preset
}

export async function POST(request: NextRequest) {
  try {
    // Two steps, in this order, on purpose. `requireStaff()` establishes who is
    // asking (session + MFA + admin-panel role) BEFORE the 100 MB body is
    // buffered, so an anonymous or reader request is refused without uploading
    // anything. Which permission row applies depends on the destination folder,
    // which only arrives with the body — so the resource-level check follows,
    // once `key` is known. `verifyAuthAndMFA` is cache()d per request, so the
    // second call costs no extra round-trip.
    await requireStaff();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const key = (formData.get("key") as string | null)?.trim();

    if (!file || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_UPLOAD_LABEL}).` },
        { status: 413 },
      );
    }
    if (!key) return NextResponse.json({ error: "No key provided" }, { status: 400 });

    if (key.startsWith("/") || key.startsWith("\\") || key.includes("..") || key.includes("\\")) {
      logSecurityEvent({ type: "upload_rejected", where: "/api/admin/upload", detail: "path traversal attempt in key" });
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      return NextResponse.json(
        { error: "File path must start with books/, posts/, research/, reports/, publications/, or paths/" },
        { status: 400 },
      );
    }

    // Refuse a folder Zima would refuse, but say WHY. The storage server
    // answers any over-long or non-ASCII path segment with a bare
    // `400 {"error":"Invalid target folder"}` — after the whole file has been
    // uploaded to this route and re-sent. Checking here costs nothing and
    // gives the operator a message they can act on.
    const pathProblem = describeStorageKeyError(key);
    if (pathProblem) {
      return NextResponse.json({ error: pathProblem }, { status: 400 });
    }

    // The destination decides the grant: a `books/` upload needs books: write,
    // a `paths/` cover needs learning_paths: write. The key is validated
    // against ALLOWED_PREFIXES above, so this cannot be steered somewhere the
    // route does not serve.
    await requirePermission(uploadPermissionResource(key), "write");

    const bytes = await file.arrayBuffer();

    // ── Content-type verification (magic bytes, never the spoofable extension) ──
    // A file's extension is OS/user-controlled: a WebP saved as `.jpg` still
    // reports image/jpeg. We sniff the real bytes. For images we trust the
    // sniffed type over the declared one and carry it downstream (`effectiveType`)
    // — sharp re-encodes to WebP regardless, so a mislabeled-but-valid image is
    // safe to accept. CSV has no signature (weaker heuristic). Everything else
    // must still match its declared type exactly.
    // The rule itself lives in `resolveUploadType` so /api/admin/bulk-upload
    // reaches the same verdict — it used to call `validateMimeType` directly
    // and refuse covers this route accepts.
    const { ok: contentOk, effectiveType } = resolveUploadType(bytes, file.type);
    if (!contentOk) {
      logSecurityEvent({ type: "upload_rejected", where: "/api/admin/upload", detail: `content does not match declared type ${file.type}` });
      return NextResponse.json(
        {
          error: `Invalid file: content does not match declared type (${file.type}).`,
        },
        { status: 400 },
      );
    }

    // ── Malware reputation check (hash lookup; failure posture is a switch — see lib/virus-scan.ts) ──
    const fileHash = sha256Hex(bytes);
    const scan = await checkFileHashReputation(fileHash);
    if (scan.verdict === "malicious") {
      logSecurityEvent({ type: "virus_scan_blocked", where: "/api/admin/upload", detail: `${scan.detections} AV engines flagged this file's hash` });
      return NextResponse.json(
        { error: "This file was flagged as malicious by security scanning and cannot be uploaded." },
        { status: 400 },
      );
    }
    if (!scan.scanned && isVirusScanFailClosed()) {
      // Skips/errors are already logged inside checkFileHashReputation; a 404
      // "hash unknown" counts as scanned and never lands here.
      return NextResponse.json(
        { error: "Malware scanning is unavailable and this deployment requires it (FAIL_CLOSED_VIRUS_SCAN). Try again shortly or contact the administrator." },
        { status: 503 },
      );
    }

    // ── Duplicate check (PDFs only; content already verified above) ──
    // Forms editing an existing record pass excludeType/excludeId so replacing
    // a file with the identical bytes is not flagged against itself.
    let contentHash: string | null = null;
    if (effectiveType === "application/pdf") {
      contentHash = fileHash;
      const excludeType = formData.get("excludeType") as string | null;
      const excludeId = (formData.get("excludeId") as string | null)?.trim();
      let exclude: { type: "book" | "research"; id: string } | undefined;
      if ((excludeType === "book" || excludeType === "research") && excludeId) {
        exclude = { type: excludeType, id: excludeId };
      }
      const duplicate = await findDuplicatePdf(contentHash, exclude);
      if (duplicate) {
        return NextResponse.json(
          {
            error: `This PDF is already in the library as "${duplicate.title}" (${duplicate.url}). Upload cancelled.`,
            duplicate,
          },
          { status: 409 },
        );
      }
    }

    // ── Optimize image before upload ──
    // Pass the sniffed type so a mislabeled image (e.g. a WebP named `.jpg`)
    // is still routed through sharp rather than passed through untouched.
    const opts = presetsForFolder(key);
    const optimized = await optimizeImage(bytes, file.name, effectiveType, opts);

    const lastSlash = key.lastIndexOf("/");
    const subfolder = lastSlash > 0 ? key.slice(0, lastSlash) : key;
    // Use optimized filename (extension may change to .webp)
    const optimizedFile = new File([optimized.buffer], optimized.filename, {
      type: optimized.contentType,
    });
    const url = await zimaUpload(optimizedFile, subfolder, optimized.filename);

    return NextResponse.json({ url, contentHash });
  } catch (err) {
    if (isAdminAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // A storage 429 or 5xx must reach the client AS a 429/5xx with its
    // Retry-After intact. Flattening these to 500 is what made the bulk
    // importer treat "wait 54 minutes" as "this row is broken" and burn
    // through 63 rows in seconds.
    if (isZimaUploadError(err) && err.status !== 400) {
      const headers = err.retryAfterSeconds
        ? { "Retry-After": String(err.retryAfterSeconds) }
        : undefined;
      return NextResponse.json(
        { error: err.message, retryAfterSeconds: err.retryAfterSeconds, retryable: err.retryable },
        { status: err.status === 429 ? 429 : 503, headers },
      );
    }
    if (isZimaUploadError(err)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[admin/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}

