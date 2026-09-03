import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requirePermission, requireStaff } from "@/lib/auth/requireAdmin";
import { uploadPermissionResource } from "@/lib/storage/permission-resource";
import { validateMimeType, resolveUploadType } from "@/lib/mime-validation";
import { sha256Hex, findDuplicatePdf } from "@/lib/content-hash";
import { zimaUpload, isZimaUploadError } from "@/lib/zima";
import { uploadStorageFiles, trashStorageFile } from "@/lib/storage-client";
import { optimizeImage, BOOK_COVER_OPTS } from "@/lib/image-optimize";
import { describeStorageKeyError, describeStoragePathError } from "@/lib/storage/folder-name";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/uploads/state";

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

// One byte under 100 MiB: Zima refuses exactly 100 MiB (see MAX_UPLOAD_BYTES
// in lib/uploads/state.ts, which is where the number now lives).

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
    return { error: jsonError(`File too large (max ${MAX_UPLOAD_LABEL}): ${field}.`, 413) };
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
    // Establish the caller before touching the body. The destination travels in
    // the form here, so the resource-level check follows immediately after the
    // path is validated — see /api/admin/upload for why the other route splits
    // the two.
    const { user } = await requireStaff();

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

    // `books.bulk` is perm("books", "write") in the registry. This route used
    // to demand requireAdmin(), which refused every librarian — the one role
    // that holds books: write by default — and the whole bulk importer with it.
    await requirePermission(uploadPermissionResource(folder), "write");

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

    // ── Optional cover ────────────────────────────────────────────────────
    //
    // A COVER PROBLEM MUST NEVER COST THE BOOK. The asymmetry documented for
    // the storage leg below applies just as much to preparing the file, and
    // this block used to break it twice:
    //
    //   - `readPart` returning its 400 ended the request, so a cover whose
    //     extension disagreed with its bytes (`.jpg` holding a PNG — the
    //     browser derives File.type from the name alone) lost the book. The
    //     single-file route has always tolerated exactly that; `resolveUploadType`
    //     is now that rule, shared.
    //   - `optimizeImage` is a sharp pipeline with no error containment. A
    //     truncated, CMYK or otherwise unreadable image threw straight past
    //     every branch here into the generic handler, and the operator got a
    //     bare 500 on a row whose PDF was perfectly good.
    //
    // Both now degrade to the same outcome the storage leg produces: no cover,
    // a warning on the row, and the book saved.
    let coverPrepWarning: string | null = null;
    if (coverName) {
      const declared = (form.get("coverType") as string | null) ?? "image/jpeg";
      const cover = form.get("cover");
      if (!(cover instanceof File) || cover.size === 0) {
        coverPrepWarning = "Cover skipped: the file was missing or empty.";
      } else if (cover.size > MAX_UPLOAD_BYTES) {
        coverPrepWarning = `Cover skipped: larger than the ${MAX_UPLOAD_LABEL} limit.`;
      } else {
        try {
          const coverBytes = await cover.arrayBuffer();
          const { ok, effectiveType } = resolveUploadType(coverBytes, declared);
          if (!ok) {
            coverPrepWarning = `Cover skipped: content does not match declared type (${declared}). Only JPEG, PNG, WebP, and AVIF are allowed.`;
          } else {
            const optimized = await optimizeImage(coverBytes, coverName, effectiveType, BOOK_COVER_OPTS);
            parts.push({
              name: optimized.filename,
              bytes: optimized.buffer,
              contentType: optimized.contentType,
            });
          }
        } catch (err) {
          coverPrepWarning = `Cover skipped: the image could not be processed (${err instanceof Error ? err.message : "unknown error"}).`;
        }
      }
    }

    const files = parts.map(
      (p) => new File([p.bytes as BlobPart], p.name, { type: p.contentType }),
    );

    // ── One request, both files ──
    //
    // PARTIAL SUCCESS IS THE INTERESTING CASE. v1 returns a per-file array and
    // has ALREADY moved each successful file into place by the time it answers,
    // so "one of two failed" is a state that exists on disk, not a hypothetical.
    // The two halves are not symmetric:
    //
    //   PDF fails  → the book cannot exist, so anything that DID land is
    //                garbage. The cover is trashed before returning, or the
    //                folder keeps a file no row will ever reference.
    //   cover fails → the book is still worth having. It is created WITHOUT a
    //                cover and the row carries a visible warning; silently
    //                dropping the cover is the outcome this must not produce.
    //
    // Results are matched BY INDEX: v1 iterates the uploaded files in order and
    // pushes one result per file, whereas originalName round-trips through a
    // latin1→utf8 decode. Index is the contract; the name is for messages.
    let pdfUrl: string | null = null;
    let coverUrl: string | null = null;
    let coverWarning: string | null = coverPrepWarning;
    let via: "v1" | "legacy" = "v1";

    const actor = { actorId: user.id, actorRole: "admin" };

    /** Trash whatever a batch DID store, so a rejected row leaves no files. */
    async function discardStored(rows: { success: boolean; file?: { storageKey: string } }[]) {
      for (const row of rows) {
        if (row.success && row.file?.storageKey) {
          await trashStorageFile(actor, row.file.storageKey).catch(() => {});
        }
      }
    }

    try {
      const result = await uploadStorageFiles(actor, folder, files, BATCH_UPLOAD_TIMEOUT_MS);

      if (!result.ok) {
        // v1 rejected the request itself (auth, scope, folder) — nothing was
        // stored, so the legacy path is safe to try.
        via = "legacy";
      } else {
        const rows = result.data ?? [];
        if (rows.length !== parts.length) {
          // v1 answered normally but with an unexpected shape. Files may be on
          // disk, so re-uploading would duplicate them: clean up and fail the
          // row instead of falling back.
          await discardStored(rows);
          return jsonError("Storage returned an unexpected response for this upload.", 502);
        }

        const pdfRow = rows[0];
        const coverRow = parts.length > 1 ? rows[1] : undefined;

        if (!pdfRow.success) {
          // The book cannot exist, so anything that landed is garbage.
          await discardStored(rows);
          return jsonError(
            `Storage rejected the PDF: ${pdfRow.error?.message ?? "unknown error"}`,
            400,
          );
        }

        pdfUrl = pdfRow.file?.url ?? null;
        if (!pdfUrl) {
          // Stored but unaddressable — same reasoning as the shape mismatch.
          await discardStored(rows);
          return jsonError("Storage stored the PDF but returned no URL for it.", 502);
        }

        if (coverRow) {
          if (coverRow.success) {
            coverUrl = coverRow.file?.url ?? null;
          } else {
            coverWarning = `Cover rejected by storage: ${coverRow.error?.message ?? "unknown error"}`;
          }
        }
      }
    } catch {
      // Not configured, unreachable, or timed out. The first two stored
      // nothing; a timeout MAY have stored the files and we cannot tell from
      // here, so the legacy retry can leave an unreferenced copy behind.
      // scripts/audit-book-storage.ts is what reconciles that, and it is a far
      // better outcome than failing every row of an import.
      via = "legacy";
    }

    // ── Fallback: the original one-request-per-file path ──
    if (via === "legacy") {
      pdfUrl = await zimaUpload(files[0], folder, parts[0].name);
      coverUrl = null;
      // Back to the preparation verdict, not to null: a cover rejected above
      // never entered `parts`, and blanking this would drop the only
      // explanation the operator gets for a book that arrived without one.
      coverWarning = coverPrepWarning;
      if (parts.length > 1) {
        try {
          coverUrl = await zimaUpload(files[1], folder, parts[1].name);
        } catch (err) {
          // Same rule as above: a missing cover must not cost the book, but it
          // must not be silent either.
          coverWarning = `Cover upload failed: ${err instanceof Error ? err.message : "unknown error"}`;
        }
      }
    }

    return NextResponse.json({
      url: pdfUrl,
      coverUrl,
      contentHash,
      via,
      warning: coverWarning,
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
