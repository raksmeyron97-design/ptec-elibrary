import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requireAdmin } from "@/lib/auth/requireAdmin";
import { validateMimeType } from "@/lib/mime-validation";
import { sha256Hex, findDuplicatePdf } from "@/lib/content-hash";
import { zimaUpload } from "@/lib/zima";
import { optimizeImage, BOOK_COVER_OPTS, POST_IMAGE_OPTS } from "@/lib/image-optimize";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/"];

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/** Pick optimization preset based on the upload folder. */
function presetsForFolder(key: string) {
  if (key.startsWith("books/")) return BOOK_COVER_OPTS;
  if (key.startsWith("posts/")) return POST_IMAGE_OPTS;
  return {};
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const key = request.headers.get("x-file-path")?.trim() ?? "";
    const contentType = request.headers.get("x-content-type") ?? "application/octet-stream";

    if (!key || key.startsWith("/") || key.startsWith("\\") || key.includes("..") || key.includes("\\")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      return NextResponse.json(
        { error: "File path must start with books/, posts/, research/, or reports/" },
        { status: 400 },
      );
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 100 MB)." }, { status: 413 });
    }

    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 100 MB)." }, { status: 413 });
    }

    if (!validateMimeType(body, contentType)) {
      return NextResponse.json(
        {
          error: `Invalid file: content does not match declared type (${contentType}). Only PDF, JPEG, PNG, WebP, and AVIF are allowed.`,
        },
        { status: 400 },
      );
    }

    // ── Duplicate check (PDFs only; bulk import always creates new records) ──
    let contentHash: string | null = null;
    if (contentType === "application/pdf") {
      contentHash = sha256Hex(body);
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
    }

    // ── Optimize image before upload ──
    const lastSlash = key.lastIndexOf("/");
    const subfolder = lastSlash > 0 ? key.slice(0, lastSlash) : key;
    const originalFilename = lastSlash > 0 ? key.slice(lastSlash + 1) : (key.split("/").pop() ?? "upload");

    const opts = presetsForFolder(key);
    const optimized = await optimizeImage(body, originalFilename, contentType, opts);

    const file = new File([optimized.buffer], optimized.filename, {
      type: optimized.contentType,
    });
    const url = await zimaUpload(file, subfolder, optimized.filename);

    return NextResponse.json({ url, contentHash });
  } catch (err) {
    if (isAdminAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[bulk-upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}

