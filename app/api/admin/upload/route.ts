import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requireAdmin } from "@/lib/auth/requireAdmin";
import { validateMimeType } from "@/lib/mime-validation";
import { sha256Hex, findDuplicatePdf } from "@/lib/content-hash";
import { zimaUpload } from "@/lib/zima";
import { optimizeImage, BOOK_COVER_OPTS, POST_IMAGE_OPTS } from "@/lib/image-optimize";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/", "publications/"];

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/** Pick optimization preset based on the upload folder. */
function presetsForFolder(key: string) {
  if (key.startsWith("books/")) return BOOK_COVER_OPTS;
  if (key.startsWith("posts/")) return POST_IMAGE_OPTS;
  return {}; // default preset
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const key = (formData.get("key") as string | null)?.trim();

    if (!file || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 100 MB)." }, { status: 413 });
    }
    if (!key) return NextResponse.json({ error: "No key provided" }, { status: 400 });

    if (key.startsWith("/") || key.startsWith("\\") || key.includes("..") || key.includes("\\")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      return NextResponse.json(
        { error: "File path must start with books/, posts/, research/, reports/, or publications/" },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();

    if (!validateMimeType(bytes, file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file: content does not match declared type (${file.type}). Only PDF, JPEG, PNG, WebP, and AVIF are allowed.`,
        },
        { status: 400 },
      );
    }

    // ── Duplicate check (PDFs only; magic bytes already verified above) ──
    // Forms editing an existing record pass excludeType/excludeId so replacing
    // a file with the identical bytes is not flagged against itself.
    let contentHash: string | null = null;
    if (file.type === "application/pdf") {
      contentHash = sha256Hex(bytes);
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
    const opts = presetsForFolder(key);
    const optimized = await optimizeImage(bytes, file.name, file.type, opts);

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
    console.error("[admin/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}

