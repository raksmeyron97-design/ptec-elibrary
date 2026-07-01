import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requireAdmin } from "@/lib/auth/requireAdmin";
import { validateMimeType } from "@/lib/mime-validation";
import { zimaUpload, folderFromKey } from "@/lib/zima";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/"];

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

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

    const filename = key.split("/").pop() ?? "upload";
    const folder = folderFromKey(key);
    const file = new File([body], filename, { type: contentType });
    const url = await zimaUpload(file, folder, filename);

    return NextResponse.json({ url });
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
