import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { streamStorageFile } from "@/lib/storage-client";

export const dynamic = "force-dynamic";

/**
 * Streaming proxy for the admin file manager's preview/download actions.
 * The browser calls THIS route (never the storage service directly) — it
 * carries the admin's session cookie, not the storage service token, which
 * stays server-side in lib/storage-client.ts. Mirrors the same
 * verify-then-proxy-then-stream pattern as app/api/books/[slug]/download.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (mode !== "download" && mode !== "preview") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let admin;
  try {
    admin = await requirePermission("storage", "read");
  } catch (e) {
    if (isAdminAuthError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { limit, windowMs } = ratePolicy("storageBrowse");
  const rl = await rateLimit(admin.userId, limit, windowMs);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const storageKey = request.nextUrl.searchParams.get("key");
  if (!storageKey) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const h = await headers();
  const actor = { actorId: admin.userId, actorRole: admin.role, requestId: h.get("x-request-id") };

  let upstream: Response;
  try {
    upstream = await streamStorageFile(actor, storageKey, mode);
  } catch {
    return NextResponse.json({ error: "Storage service is temporarily unavailable." }, { status: 503 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "File not found." }, { status: upstream.status === 404 ? 404 : 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? `attachment`,
      "Cache-Control": "private, no-store",
    },
  });
}
