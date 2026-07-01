import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthError, requireAdmin } from "@/lib/auth/requireAdmin";
import { validateMimeType } from "@/lib/mime-validation";
import { zimaUpload } from "@/lib/zima";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/"];

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

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
        { error: "File path must start with books/, posts/, research/, or reports/" },
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

    const lastSlash = key.lastIndexOf("/");
    const subfolder = lastSlash > 0 ? key.slice(0, lastSlash) : key;
    const filename = lastSlash > 0 ? key.slice(lastSlash + 1) : undefined;
    const url = await zimaUpload(file, subfolder, filename);

    return NextResponse.json({ url });
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
