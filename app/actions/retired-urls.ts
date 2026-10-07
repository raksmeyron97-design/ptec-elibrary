"use server";

// The retired-URL queue (migration 0170, SEO audit 2026-10 WI-1).
//
// A public record that left the site — deleted, unpublished, or one of the 43
// dead URLs seeded by 0171 — waits in retired_url_queue for a librarian:
//
//   redirect  → url_redirects 301 to a LIVE successor
//   gone      → url_redirects 410 (removed on purpose)
//   ignore    → nothing changes; the URL keeps answering 404
//
// Every mutation goes through one registry gate before it opens anything,
// re-checks the target against the database rather than trusting the browser,
// writes url_redirects ONLY through upsert_url_redirect (chain collapse + loop
// refusal live there), asks its updates for their rows, and writes an audit
// row. The removal reason is stored in url_redirects.reason and nowhere else:
// it can say rights_removal, and rights material never reaches a log.

import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { rateLimit } from "@/lib/rate-limit";
import { revalidateBook, revalidateLocalizedPath, revalidateTaxonomy, revalidateThesis } from "@/lib/cache/revalidate";
import { EBOOKS_RETIRED_URLS_PATH } from "@/lib/admin/ebooks-url";
import {
  isGoneReason,
  isStoredPathShape,
  parseTarget,
  redirectReason,
  type TargetCollection,
} from "@/lib/url-redirects/queue";
import { chunkByEncodedLength, resolvedElsewhere } from "@/lib/url-redirects/resolved";

export type RetiredUrlResult =
  | { success: true; count?: number }
  | {
      success: false;
      code:
        | "forbidden"
        | "rate_limited"
        | "invalid"
        | "not_found"
        | "target_not_live"
        | "path_is_live"
        | "loop"
        | "failed";
      detail?: string;
    };

type Admin = Awaited<ReturnType<typeof requireAction>>;
type Db = Admin["supabase"];

async function open(actionId: string): Promise<Admin> {
  const admin = await requireAction(actionId);
  const { success } = await rateLimit(`retired-urls:${admin.user.id}`, 60, 60_000);
  if (!success) throw Object.assign(new Error("rate_limited"), { code: "rate_limited" as const });
  return admin;
}

function toResult(error: unknown): RetiredUrlResult {
  const code = (error as { code?: string })?.code;
  if (code === "rate_limited") return { success: false, code: "rate_limited" };
  const status = (error as { status?: number })?.status;
  if (status === 403 || status === 401) return { success: false, code: "forbidden" };
  return { success: false, code: "failed", detail: error instanceof Error ? error.message : undefined };
}

const TABLE: Record<TargetCollection, { table: string; published: boolean }> = {
  books: { table: "books", published: true },
  theses: { table: "research_reports", published: true },
  // Subject hubs exist on existence alone (lib/resource-slug-gate.ts).
  subjects: { table: "categories", published: false },
};

/** Is this path a live public record right now? `null` when the read failed. */
async function isLive(supabase: Db, path: string): Promise<boolean | null> {
  const target = parseTarget(path);
  if (!target) return false;
  const { table, published } = TABLE[target.collection];
  let query = supabase.from(table).select("slug").eq("slug", target.slug);
  if (published) query = query.eq("is_published", true);
  const { data, error } = await query.limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

function revalidateTarget(target: string) {
  const parsed = parseTarget(target);
  if (!parsed) return;
  if (parsed.collection === "books") revalidateBook(parsed.slug);
  else if (parsed.collection === "theses") revalidateThesis(parsed.slug);
  else revalidateTaxonomy();
}

async function queueRow(supabase: Db, path: string) {
  return supabase.from("retired_url_queue").select("path, resolution").eq("path", path).maybeSingle();
}

async function markResolved(
  supabase: Db,
  path: string,
  resolution: "redirected" | "gone" | "ignored",
  userId: string,
) {
  return supabase
    .from("retired_url_queue")
    .update({ resolution, resolved_by: userId, resolved_at: new Date().toISOString() })
    .eq("path", path)
    .select("path");
}

/** 301 a queued path to a live successor. */
export async function redirectRetiredUrl(input: {
  path: string;
  target: string;
  reason?: string | null;
}): Promise<RetiredUrlResult> {
  try {
    const { supabase, user } = await open("books.retiredUrls.resolve");
    const path = input.path?.trim() ?? "";
    const target = input.target?.trim() ?? "";
    if (!isStoredPathShape(path) || !parseTarget(target) || target === path) {
      return { success: false, code: "invalid" };
    }

    const { data: row, error: rowError } = await queueRow(supabase, path);
    if (rowError) return { success: false, code: "failed", detail: rowError.message };
    if (!row) return { success: false, code: "not_found" };

    const [pathLive, targetLive] = await Promise.all([isLive(supabase, path), isLive(supabase, target)]);
    if (pathLive === null || targetLive === null) return { success: false, code: "failed" };
    if (pathLive) return { success: false, code: "path_is_live" };
    if (!targetLive) return { success: false, code: "target_not_live" };

    const reason = redirectReason(path, target, input.reason);
    const { error: rpcError } = await supabase.rpc("upsert_url_redirect", {
      p_old: path,
      p_target: target,
      p_status: 301,
      p_reason: reason,
      p_actor: user.id,
    });
    if (rpcError) {
      return /would loop/.test(rpcError.message)
        ? { success: false, code: "loop" }
        : { success: false, code: "failed", detail: rpcError.message };
    }

    const { data: updated, error: updateError } = await markResolved(supabase, path, "redirected", user.id);
    if (updateError) return { success: false, code: "failed", detail: updateError.message };
    if (!updated?.length) return { success: false, code: "not_found" };

    await logAdminAction(user.id, "url.redirect", "url_redirects", undefined, { path, target });
    revalidateTarget(target);
    revalidateLocalizedPath(EBOOKS_RETIRED_URLS_PATH);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/** 410 a queued path: removed on purpose. The reason stays in the table. */
export async function markRetiredUrlGone(input: { path: string; reason: string }): Promise<RetiredUrlResult> {
  try {
    const { supabase, user } = await open("books.retiredUrls.resolve");
    const path = input.path?.trim() ?? "";
    if (!isStoredPathShape(path) || !isGoneReason(input.reason)) return { success: false, code: "invalid" };

    const { data: row, error: rowError } = await queueRow(supabase, path);
    if (rowError) return { success: false, code: "failed", detail: rowError.message };
    if (!row) return { success: false, code: "not_found" };

    const live = await isLive(supabase, path);
    if (live === null) return { success: false, code: "failed" };
    if (live) return { success: false, code: "path_is_live" };

    const { error: rpcError } = await supabase.rpc("upsert_url_redirect", {
      p_old: path,
      p_target: null,
      p_status: 410,
      p_reason: input.reason,
      p_actor: user.id,
    });
    if (rpcError) return { success: false, code: "failed", detail: rpcError.message };

    const { data: updated, error: updateError } = await markResolved(supabase, path, "gone", user.id);
    if (updateError) return { success: false, code: "failed", detail: updateError.message };
    if (!updated?.length) return { success: false, code: "not_found" };

    // The path only — never the reason.
    await logAdminAction(user.id, "url.gone", "url_redirects", undefined, { path });
    revalidateLocalizedPath(EBOOKS_RETIRED_URLS_PATH);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/** Leave the URL as a 404 and take it out of the pending list. */
export async function ignoreRetiredUrl(input: { path: string }): Promise<RetiredUrlResult> {
  try {
    const { supabase, user } = await open("books.retiredUrls.resolve");
    const path = input.path?.trim() ?? "";
    if (!isStoredPathShape(path)) return { success: false, code: "invalid" };
    const { data: updated, error } = await markResolved(supabase, path, "ignored", user.id);
    if (error) return { success: false, code: "failed", detail: error.message };
    if (!updated?.length) return { success: false, code: "not_found" };
    await logAdminAction(user.id, "url.ignore", "url_redirects", undefined, { path });
    revalidateLocalizedPath(EBOOKS_RETIRED_URLS_PATH);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * Ignore, in one go, every pending row whose path already resolves another
 * way — live again, a book_slug_redirects alias, or an existing url_redirects
 * row. Recomputed here rather than taken from the page: the browser sends no
 * list, so it cannot ignore a row that does not qualify.
 */
export async function ignoreResolvedElsewhere(): Promise<RetiredUrlResult> {
  try {
    const { supabase, user } = await open("books.retiredUrls.resolve");
    const { data: pending, error } = await supabase
      .from("retired_url_queue")
      .select("path")
      .eq("resolution", "pending")
      .limit(1000);
    if (error) return { success: false, code: "failed", detail: error.message };
    const paths = (pending ?? []).map((r) => r.path as string);
    const resolved = await resolvedElsewhere(supabase, paths);
    if (resolved === null) return { success: false, code: "failed" };
    if (resolved.size === 0) return { success: true, count: 0 };

    const resolvedAt = new Date().toISOString();
    let count = 0;
    for (const chunk of chunkByEncodedLength([...resolved])) {
      const { data: updated, error: updateError } = await supabase
        .from("retired_url_queue")
        .update({ resolution: "ignored", resolved_by: user.id, resolved_at: resolvedAt })
        .in("path", chunk)
        .eq("resolution", "pending")
        .select("path");
      if (updateError) return { success: false, code: "failed", detail: updateError.message };
      count += updated?.length ?? 0;
    }
    await logAdminAction(user.id, "url.ignore_resolved", "url_redirects", undefined, { count });
    revalidateLocalizedPath(EBOOKS_RETIRED_URLS_PATH);
    return { success: true, count };
  } catch (error) {
    return toResult(error);
  }
}

/** Delete a url_redirects row (admins only). The path answers 404 again. */
export async function deleteUrlRedirect(input: { path: string }): Promise<RetiredUrlResult> {
  try {
    const { supabase, user } = await open("books.retiredUrls.deleteRedirect");
    const path = input.path?.trim() ?? "";
    if (!isStoredPathShape(path)) return { success: false, code: "invalid" };
    const { data: deleted, error } = await supabase
      .from("url_redirects")
      .delete()
      .eq("old_path", path)
      .select("old_path");
    if (error) return { success: false, code: "failed", detail: error.message };
    if (!deleted?.length) return { success: false, code: "not_found" };
    await logAdminAction(user.id, "url.redirect_delete", "url_redirects", undefined, { path });
    revalidateLocalizedPath(EBOOKS_RETIRED_URLS_PATH);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

export type RedirectTargetOption = { path: string; title: string; kind: "book" | "thesis" | "subject" };

/** `%` and `_` are ilike wildcards; a reader's words must match literally. */
function likeLiteral(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Live records a librarian can redirect to, by title (subjects by name). Only
 * LIVE records are offered — the redirect action re-checks anyway.
 */
export async function searchRedirectTargets(query: string): Promise<RedirectTargetOption[]> {
  try {
    const { supabase } = await open("books.retiredUrls.resolve");
    const q = (query ?? "").trim().slice(0, 120);
    if (q.length < 2) return [];
    const pattern = `%${likeLiteral(q)}%`;
    const [books, theses, subjects] = await Promise.all([
      supabase.from("books").select("slug, title").eq("is_published", true).ilike("title", pattern).order("title").limit(8),
      supabase.from("research_reports").select("slug, title").eq("is_published", true).ilike("title", pattern).order("title").limit(5),
      supabase.from("categories").select("slug, name").ilike("name", pattern).order("name").limit(4),
    ]);
    const out: RedirectTargetOption[] = [];
    for (const r of books.data ?? []) if (r.slug) out.push({ path: `/books/${r.slug}`, title: r.title ?? r.slug, kind: "book" });
    for (const r of theses.data ?? []) if (r.slug) out.push({ path: `/theses/${r.slug}`, title: r.title ?? r.slug, kind: "thesis" });
    for (const r of subjects.data ?? []) if (r.slug) out.push({ path: `/subjects/${r.slug}`, title: r.name ?? r.slug, kind: "subject" });
    return out;
  } catch {
    return [];
  }
}
