import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requireAdmin } from "@/lib/auth/requireAdmin";
import { validateMimeType } from "@/lib/mime-validation";
import { sha256Hex, findDuplicatePdf } from "@/lib/content-hash";
import { zimaUpload, isZimaUploadError } from "@/lib/zima";
import { uploadStorageFiles } from "@/lib/storage-client";
import { optimizeImage, BOOK_COVER_OPTS } from "@/lib/image-optimize";
import { describeStorageKeyError, describeStoragePathError } from "@/lib/storage/folder-name";

export const runtime = "nodejs";
export const maxDuration = 300;

/*
 * ONE REQUEST PER BOOK, NOT ONE PER FILE.
 *
 * Zima meters uploads per REQUEST, not per file, and it has two upload
 * endpoints on two independent counters:
 *
 *   POST /api/upload      `upload:<ip>`     RL_UPLOAD_PER_HOUR = 60   1 file/req
 *   POST /api/v1/files    `v1-upload:<ip>`  storageUploadPerHour = 120  up to 10 files/req
 *
 * The importer used the first, sending the PDF and the cover separately, so a
 * book cost 2 of 60 — 30 books/hour, and an 86-row import spent most of its
 * time waiting out quota windows. Sending both files of one book in a single
 * v1 request costs 1 of 120: 120 books/hour, four times the throughput, with
 * no limit raised or removed anywhere.
 *
 * Both counters are keyed by client IP and every upload reaches Zima from THIS
 * server, so the whole application shares each bucket. Moving the importer to
 * v1 also stops it competing with the single-book form, the thesis form and
 * the publication form, which still use the legacy endpoint.
 *
 * WHY THE LEGACY PATH IS STILL HERE. v1 authorizes on `storage:write`, a
 * different scope from the legacy endpoint's `write:files`, carried by a
 * different key (STORAGE_SERVICE_TOKEN vs ZIMA_API_KEY). If that key is
 * missing or unscoped, falling back keeps imports working at the old rate
 * rather than failing every row. The response says which path ran so the
 * operator is told when they are on the slow one, instead of quietly waiting.
 */

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/"];

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB, matching Zima's MAX_UPLOAD_SIZE_MB

/** A large PDF plus a cover, over the tunnel — the client's 2 min is tight. */
const BATCH_UPLOAD_TIMEOUT_MS = 240_000;

interface PreparedFile {
  /** Name Zima stores under, before it appends its own uuid. */
  name: string;
  bytes: Uint8Array;
  contentType: string;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Read one uploaded part, enforcing the size cap and magic-byte check. */
async function readPart(
  form: FormData,
  field: string,
  expectedType: string,
): Promise<{ file: File; bytes: ArrayBuffer } | { error: NextResponse }> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) {
    return { error: jsonError(`Missing "${field}" file.`, 400) };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: jsonError(`File too large (max 100 MB): ${field}.`, 413) };
  }
  const bytes = await file.arrayBuffer();
  if (!validateMimeType(bytes, expectedType)) {
    return {
      error: jsonError(
        `Invalid ${field}: content does not match declared type (${expectedType}). Only PDF, JPEG, PNG, WebP, and AVIF are allowed.`,
        400,
      ),
    };
  }
  return { file, bytes };
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdmin();

    const form = await request.formData();
    const folder = (form.get("folder") as string | null)?.trim() ?? "";
    const pdfName = ((form.get("pdfName") as string | null) ?? "book.pdf").trim();
    const coverName = ((form.get("coverName") as string | null) ?? "").trim();

    // ── Destination checks (same rules as before, now once per book) ──
    if (!folder || folder.startsWith("/") || folder.includes("..") || folder.includes("\\")) {
      return jsonError("Invalid folder", 400);
    }
    if (!ALLOWED_PREFIXES.some((p) => `${folder}/`.startsWith(p))) {
      return jsonError("Folder must start with books/, posts/, research/, or reports/", 400);
    }
    const pathProblem = describeStoragePathError(folder) ?? describeStorageKeyError(`${folder}/${pdfName}`);
    if (pathProblem) return jsonError(pathProblem, 400);

    const pdfPart = await readPart(form, "pdf", "application/pdf");
    if ("error" in pdfPart) return pdfPart.error;

    // ── Duplicate check BEFORE any upload ──
    // Deliberately ahead of the storage call: a re-run of an already-imported
    // CSV must cost zero Zima quota, not one request per row.
    const contentHash = sha256Hex(pdfPart.bytes);
    const duplicate = await findDuplicatePdf(contentHash);
    if (duplicate) {
      return NextResponse.json(
        {
          error: `This PDF is already in the library as "${duplicate.title}" (${duplicate.url}). Row skipped.`,
          duplicate,
        },
        { status: 409 },
      );
    }

    const parts: PreparedFile[] = [
      { name: pdfName, bytes: new Uint8Array(pdfPart.bytes), contentType: "application/pdf" },
    ];

    // ── Optional cover, optimized here so the batch carries final bytes ──
    if (coverName) {
      const declared = (form.get("coverType") as string | null) ?? "image/jpeg";
      const coverPart = await readPart(form, "cover", declared);
      if ("error" in coverPart) return coverPart.error;
      const optimized = await optimizeImage(coverPart.bytes, coverName, declared, BOOK_COVER_OPTS);
      parts.push({
        name: optimized.filename,
        bytes: optimized.buffer,
        contentType: optimized.contentType,
      });
    }

    const files = parts.map(
      (p) => new File([p.bytes as BlobPart], p.name, { type: p.contentType }),
    );

    // ── One request, both files ──
    let urls: string[] | null = null;
    let via: "v1" | "legacy" = "v1";
    try {
      const result = await uploadStorageFiles(
        { actorId: user.id, actorRole: "admin" },
        folder,
        files,
        BATCH_UPLOAD_TIMEOUT_MS,
      );
      if (result.ok && result.data) {
        const failed = result.data.find((r) => !r.success);
        if (failed) {
          // A per-file rejection is a real problem with THAT file (bad
          // signature, blocked type), not a transport fault — do not retry it
          // on the legacy path, just report it.
          return jsonError(
            `Storage rejected ${failed.originalName}: ${failed.error?.message ?? "unknown error"}`,
            400,
          );
        }
        urls = parts.map((p) => {
          const hit = result.data!.find((r) => r.originalName === p.name);
          return hit?.file?.url ?? "";
        });
        if (urls.some((u) => !u)) urls = null; // response shape not as expected
      }
      if (!urls) via = "legacy";
    } catch {
      // Not configured, wrong scope, or unreachable — fall back rather than
      // failing the import, and tell the caller which path actually ran.
      via = "legacy";
    }

    // ── Fallback: the original one-request-per-file path ──
    if (!urls) {
      urls = [];
      for (const part of parts) {
        const file = new File([part.bytes as BlobPart], part.name, { type: part.contentType });
        urls.push(await zimaUpload(file, folder, part.name));
      }
    }

    return NextResponse.json({
      url: urls[0],
      coverUrl: urls[1] ?? null,
      contentHash,
      via,
    });
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
    console.error("[bulk-upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
