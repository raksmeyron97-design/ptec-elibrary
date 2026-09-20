// app/api/admin/books/[id]/file/route.ts
//
// The rights-review path: a librarian opening the file of a book the library
// has withdrawn from public distribution (`file_access = 'catalogue_only'`,
// migration 0151).
//
// ── Why this is a separate route ─────────────────────────────────────────────
//
// /api/books/[slug]/download carries an override for `read_online` books, and
// that is right: read-online-only is a LIBRARY choice about a file PTEC holds
// and may distribute, so the people who set it may look past it.
//
// Catalogue-only is usually a RIGHTS position, and the public route therefore
// answers it identically for everyone — reader, librarian, super admin,
// verified Googlebot. One rule, no "unless" in the hot path, nothing to
// reason about when reading that route. Staff access does not disappear; it
// moves somewhere it cannot be confused with a reader's request, behind the
// admin guard, audited every time.
//
// Not a bypass: it demands books:write — the same check that SETS the policy,
// carrying the admin panel's MFA requirement with it — and it streams inline,
// never as an attachment.

import { NextResponse } from "next/server";
import { isAdminAuthError, requirePermission } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/app/actions/audit";
import { toAllowedStorageUrl, zimaFetch } from "@/lib/zima";

export const runtime = "nodejs";

const NO_STORE = "private, no-cache, no-store, max-age=0";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Guard BEFORE the service client is opened — the rule every /api/admin
  // route here follows (lib/admin/authorization-boundary.test.ts).
  let actor: { userId: string; role: string };
  try {
    const { userId, role } = await requirePermission("books", "write");
    actor = { userId, role };
  } catch (err) {
    if (isAdminAuthError(err)) {
      return new NextResponse(err.message, { status: err.status });
    }
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();
  const { data, error } = await db
    .from("books")
    .select("id, title, file_access, book_files ( file_url, format )")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return new NextResponse("Book not found", { status: 404 });

  const files = Array.isArray(data.book_files) ? data.book_files : [data.book_files];
  const pdf = files.find((f: { format?: string } | null) => f?.format === "pdf") ?? files[0];
  const fileUrl = (pdf as { file_url?: string } | null)?.file_url ?? null;
  if (!fileUrl) return new NextResponse("File not found", { status: 404 });

  // Same allow-list the indexer uses: an admin session is not a reason to
  // fetch an arbitrary URL a database row happens to contain.
  const safeUrl = toAllowedStorageUrl(fileUrl);
  if (!safeUrl) return new NextResponse("File not available", { status: 404 });

  // Audited on every retrieval, not only on restricted books: the point of
  // the record is that someone looked, and which book they looked at.
  await logAdminAction(actor.userId, "book.rights_review_fetch", "books", data.id as string, {
    title: data.title,
    fileAccess: data.file_access ?? "public",
    role: actor.role,
  });

  const upstream = await zimaFetch(safeUrl.toString(), request.headers.get("range"));
  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("File not found in storage", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  // Inline, never `attachment` — the same rule the public file route is
  // source-scanned for. This is a review surface, not a distribution one.
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", NO_STORE);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  for (const h of ["content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
