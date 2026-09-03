import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { isAdminAuthError, requirePermission, requireStaff } from "@/lib/auth/requireAdmin";
import { uploadPermissionResource } from "@/lib/storage/permission-resource";
import { resolveUploadType } from "@/lib/mime-validation";
import { sha256Hex, findDuplicatePdf } from "@/lib/content-hash";
import { zimaUpload, isZimaUploadError } from "@/lib/zima";
import { optimizeImage, BOOK_COVER_OPTS, POST_IMAGE_OPTS } from "@/lib/image-optimize";
import { logSecurityEvent } from "@/lib/security-log";
import { describeStorageKeyError } from "@/lib/storage/folder-name";
import { checkFileHashReputation, isVirusScanFailClosed } from "@/lib/virus-scan";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/", "publications/", "paths/"];
const MAX_TOTAL_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB global limit

const CHUNKS_BASE_DIR = path.join(os.tmpdir(), "ptec-upload-chunks");

// Sanitize uploadId to safe alphanumeric/hyphen characters to prevent directory traversal
const UPLOAD_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function cleanOldChunkDirs(activeUploadId?: string) {
  try {
    if (!fs.existsSync(CHUNKS_BASE_DIR)) return;
    const entries = fs.readdirSync(CHUNKS_BASE_DIR);
    const now = Date.now();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    for (const id of entries) {
      if (activeUploadId && id === activeUploadId) continue;
      const dir = path.join(CHUNKS_BASE_DIR, id);
      try {
        const stats = fs.statSync(dir);
        if (
          typeof stats.mtimeMs === "number" &&
          stats.mtimeMs > 1_000_000_000_000 &&
          now - stats.mtimeMs > TWO_HOURS_MS
        ) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {
        // ignore concurrent delete
      }
    }
  } catch {
    // best-effort cleanup
  }
}

function presetsForFolder(key: string) {
  if (key.startsWith("books/")) return BOOK_COVER_OPTS;
  if (key.startsWith("posts/")) return POST_IMAGE_OPTS;
  return {};
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authorization checks
    await requireStaff();

    const formData = await request.formData();
    const uploadId = (formData.get("uploadId") as string | null)?.trim() ?? "";
    const rawChunkIndex = formData.get("chunkIndex");
    const rawTotalChunks = formData.get("totalChunks");
    const fileName = (formData.get("fileName") as string | null)?.trim() ?? "upload";
    const rawFileSize = formData.get("fileSize");
    const key = (formData.get("key") as string | null)?.trim();
    const chunk = formData.get("chunk") as File | null;

    if (!uploadId || !UPLOAD_ID_RE.test(uploadId)) {
      return NextResponse.json({ error: "Invalid or missing uploadId" }, { status: 400 });
    }

    const chunkIndex = typeof rawChunkIndex === "string" ? parseInt(rawChunkIndex, 10) : -1;
    const totalChunks = typeof rawTotalChunks === "string" ? parseInt(rawTotalChunks, 10) : -1;
    const declaredFileSize = typeof rawFileSize === "string" ? parseInt(rawFileSize, 10) : 0;

    if (isNaN(chunkIndex) || isNaN(totalChunks) || chunkIndex < 0 || totalChunks < 1 || chunkIndex >= totalChunks) {
      return NextResponse.json({ error: "Invalid chunkIndex or totalChunks" }, { status: 400 });
    }

    if (totalChunks > 50) {
      return NextResponse.json({ error: "Too many chunks (max 50 chunks / 250 MB)" }, { status: 400 });
    }

    if (declaredFileSize > MAX_TOTAL_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File exceeds 100 MB maximum limit" }, { status: 413 });
    }

    if (!chunk || chunk.size === 0) {
      return NextResponse.json({ error: `Missing or empty chunk ${chunkIndex}` }, { status: 400 });
    }

    if (!key) {
      return NextResponse.json({ error: "Missing destination key" }, { status: 400 });
    }

    if (key.startsWith("/") || key.startsWith("\\") || key.includes("..") || key.includes("\\")) {
      logSecurityEvent({ type: "upload_rejected", where: "/api/admin/upload/chunk", detail: "path traversal attempt in key" });
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      return NextResponse.json(
        { error: "File path must start with books/, posts/, research/, reports/, publications/, or paths/" },
        { status: 400 },
      );
    }

    const pathProblem = describeStorageKeyError(key);
    if (pathProblem) {
      return NextResponse.json({ error: pathProblem }, { status: 400 });
    }

    await requirePermission(uploadPermissionResource(key), "write");

    // 2. Write chunk to temp storage
    const chunkDir = path.join(CHUNKS_BASE_DIR, uploadId);
    fs.mkdirSync(chunkDir, { recursive: true });

    const chunkPath = path.join(chunkDir, `part-${chunkIndex}`);
    const chunkArrayBuffer = await chunk.arrayBuffer();
    fs.writeFileSync(chunkPath, Buffer.from(chunkArrayBuffer));

    // Intermediate chunk - confirm receipt
    if (chunkIndex < totalChunks - 1) {
      return NextResponse.json({
        success: true,
        chunkIndex,
        totalChunks,
      });
    }

    // 3. Final chunk received: Assemble the full file
    setTimeout(() => cleanOldChunkDirs(uploadId), 50);

    const missingParts: number[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(chunkDir, `part-${i}`);
      if (!fs.existsSync(partPath) || fs.statSync(partPath).size === 0) {
        missingParts.push(i);
      }
    }

    if (missingParts.length > 0) {
      console.warn(`[admin/upload/chunk] Assembly gap for ${uploadId}: missing chunks [${missingParts.join(", ")}] of ${totalChunks}`);
      return NextResponse.json(
        {
          error: `Missing chunk ${missingParts[0]} during final assembly. Please retry.`,
          missingChunks: missingParts,
        },
        { status: 400 },
      );
    }

    const assembledPath = path.join(chunkDir, "assembled.bin");
    const writeStream = fs.createWriteStream(assembledPath);

    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(chunkDir, `part-${i}`);
      const data = fs.readFileSync(partPath);
      writeStream.write(data);
    }
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    const assembledBuffer = fs.readFileSync(assembledPath);
    const assembledBytes = assembledBuffer.buffer.slice(
      assembledBuffer.byteOffset,
      assembledBuffer.byteOffset + assembledBuffer.byteLength,
    );

    if (assembledBytes.byteLength > MAX_TOTAL_UPLOAD_BYTES) {
      fs.rmSync(chunkDir, { recursive: true, force: true });
      return NextResponse.json({ error: "Assembled file exceeds 100 MB limit." }, { status: 413 });
    }

    // 4. Validate Content-type by magic bytes
    const { ok: contentOk, effectiveType } = resolveUploadType(assembledBytes, chunk.type);
    if (!contentOk) {
      fs.rmSync(chunkDir, { recursive: true, force: true });
      logSecurityEvent({
        type: "upload_rejected",
        where: "/api/admin/upload/chunk",
        detail: `content does not match declared type ${chunk.type}`,
      });
      return NextResponse.json(
        { error: `Invalid file: content does not match allowed file types (${chunk.type}).` },
        { status: 400 },
      );
    }

    // 5. Malware reputation check (hash lookup)
    const fileHash = sha256Hex(assembledBytes);
    const scan = await checkFileHashReputation(fileHash);
    if (scan.verdict === "malicious") {
      fs.rmSync(chunkDir, { recursive: true, force: true });
      logSecurityEvent({
        type: "virus_scan_blocked",
        where: "/api/admin/upload/chunk",
        detail: `${scan.detections} AV engines flagged this file's hash`,
      });
      return NextResponse.json(
        { error: "This file was flagged as malicious by security scanning and cannot be uploaded." },
        { status: 400 },
      );
    }

    if (!scan.scanned && isVirusScanFailClosed()) {
      fs.rmSync(chunkDir, { recursive: true, force: true });
      return NextResponse.json(
        { error: "Malware scanning is unavailable and this deployment requires it. Try again shortly." },
        { status: 503 },
      );
    }

    // 6. Duplicate check for PDFs
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
        fs.rmSync(chunkDir, { recursive: true, force: true });
        return NextResponse.json(
          {
            error: `This PDF is already in the library as "${duplicate.title}" (${duplicate.url}). Upload cancelled.`,
            duplicate,
          },
          { status: 409 },
        );
      }
    }

    // 7. Optimize image if applicable
    const opts = presetsForFolder(key);
    const optimized = await optimizeImage(assembledBytes, fileName, effectiveType, opts);

    const lastSlash = key.lastIndexOf("/");
    const subfolder = lastSlash > 0 ? key.slice(0, lastSlash) : key;

    const optimizedFile = new File([optimized.buffer], optimized.filename, {
      type: optimized.contentType,
    });

    // 8. Upload assembled file to Zima Storage
    const url = await zimaUpload(optimizedFile, subfolder, optimized.filename);

    // 9. Cleanup temp files
    fs.rmSync(chunkDir, { recursive: true, force: true });

    return NextResponse.json({ url, contentHash, success: true });
  } catch (err) {
    if (isAdminAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
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
    console.error("[admin/upload/chunk]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chunked upload failed" },
      { status: 500 },
    );
  }
}
