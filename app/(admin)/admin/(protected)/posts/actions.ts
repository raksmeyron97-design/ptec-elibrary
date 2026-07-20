"use server";

// app/admin/posts/actions.ts
import { revalidateLocalizedPath as revalidatePath, revalidatePost } from "@/lib/cache/revalidate";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { zimaDelete } from "@/lib/zima";
import { logAdminAction } from "@/app/actions/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  CATEGORIES,
  STATUSES,
  VISIBILITY_OPTIONS,
  slugify,
  uniqueSlug,
  checkSlugAvailable,
  normalizeEventFormat,
  normalizeEventStatusOverride,
  type PostCategory,
  type PostStatus,
  type PostVisibility,
} from "@/lib/admin/posts";
import { validatePost, firstValidationError } from "@/lib/admin/post-validation";
import { eventColumnsAvailable } from "@/lib/posts-data";

/** Server Action wrapper — lets client components call the lib helper directly. */
export async function checkSlugAvailableAction(slug: string, ignoreId?: string): Promise<boolean> {
  await requirePermission("posts", "read");
  return checkSlugAvailable(slug, ignoreId);
}

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function normalizeCategory(raw: string): PostCategory {
  return (CATEGORIES as readonly string[]).includes(raw) ? (raw as PostCategory) : "Other";
}

function normalizeStatus(raw: string): PostStatus {
  return (STATUSES as readonly string[]).includes(raw) ? (raw as PostStatus) : "draft";
}

function normalizeVisibility(raw: string): PostVisibility {
  return (VISIBILITY_OPTIONS as readonly string[]).includes(raw) ? (raw as PostVisibility) : "public";
}

function deriveExcerpt(content: string, provided: string | null): string | null {
  if (provided && provided.trim()) return provided.trim().slice(0, 300);
  const plain = content.replace(/[#*_`>\-\[\]()!]/g, "").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  return plain.length > 150 ? `${plain.slice(0, 150).trimEnd()}…` : plain;
}

function parseStringArray(formData: FormData, key: string): string[] {
  const raw = formData.get(key);
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string" && !!u) : [];
  } catch {
    return [];
  }
}

type CoverMeta = Record<string, { alt?: string; isHero?: boolean }>;

function parseCoverMeta(formData: FormData): CoverMeta {
  const raw = formData.get("coverMeta");
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CoverMeta) : {};
  } catch {
    return {};
  }
}

const parseCoverUrls = (fd: FormData) => parseStringArray(fd, "coverUrls");
const parseTags = (fd: FormData) => parseStringArray(fd, "tags").slice(0, 10);

/** Best-effort request metadata for audit logs — never blocks the action. */
async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    return { ip, userAgent: h.get("user-agent") ?? undefined };
  } catch {
    return {};
  }
}

async function enforceRateLimit(userId: string) {
  const { success } = await rateLimit(`post-mutate:${userId}`, 30, 60_000);
  if (!success) throw new Error("Too many changes — please wait a moment and try again.");
}

type PublishFields = {
  status: PostStatus;
  scheduledAt: string | null;
  visibility: PostVisibility;
};

function readPublishFields(formData: FormData): PublishFields {
  const status = normalizeStatus((formData.get("status")?.toString() ?? "draft").trim());
  const scheduledAtRaw = formData.get("scheduledAt")?.toString().trim();
  const visibility = normalizeVisibility((formData.get("visibility")?.toString() ?? "public").trim());
  return {
    status,
    scheduledAt: status === "scheduled" && scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : null,
    visibility,
  };
}

function toIsoOrNull(raw: string | null | undefined): string | null {
  const v = raw?.toString().trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type EventFieldColumns = {
  event_start_at: string | null;
  event_end_at: string | null;
  event_location: string | null;
  event_format: string | null;
  event_registration_url: string | null;
  event_registration_deadline: string | null;
  event_status_override: string | null;
};

/**
 * Event columns are only stored for Event-category posts; switching a post away
 * from Event clears them so stale event data can never resurface publicly.
 */
function readEventFields(formData: FormData, category: PostCategory): EventFieldColumns {
  if (category !== "Event") {
    return {
      event_start_at: null,
      event_end_at: null,
      event_location: null,
      event_format: null,
      event_registration_url: null,
      event_registration_deadline: null,
      event_status_override: null,
    };
  }
  return {
    event_start_at: toIsoOrNull(formData.get("eventStartAt")?.toString()),
    event_end_at: toIsoOrNull(formData.get("eventEndAt")?.toString()),
    event_location: formData.get("eventLocation")?.toString().trim() || null,
    event_format: normalizeEventFormat(formData.get("eventFormat")?.toString() ?? null),
    event_registration_url: formData.get("eventRegistrationUrl")?.toString().trim() || null,
    event_registration_deadline: toIsoOrNull(formData.get("eventRegistrationDeadline")?.toString()),
    event_status_override: normalizeEventStatusOverride(formData.get("eventStatusOverride")?.toString() ?? null),
  };
}

function readFeatured(formData: FormData): boolean {
  return formData.get("featured")?.toString() === "true";
}

// ── createPost ────────────────────────────────────────────────────
export async function createPost(formData: FormData) {
  const { supabase, user } = await requirePermission("posts", "write");
  await enforceRateLimit(user.id);

  const title = requiredText(formData, "title");
  const content = requiredText(formData, "content");
  const category = normalizeCategory(requiredText(formData, "category"));
  const excerpt = deriveExcerpt(content, formData.get("excerpt")?.toString() ?? null);
  const coverUrls = parseCoverUrls(formData);
  const coverMeta = parseCoverMeta(formData);
  const tags = parseTags(formData);
  const { status, scheduledAt, visibility } = readPublishFields(formData);
  const eventFields = readEventFields(formData, category);
  const featured = readFeatured(formData);

  const requestedSlug = formData.get("slug")?.toString().trim();
  const slugBase = slugify(requestedSlug || title);

  const errors = validatePost({
    title, slug: slugBase || "post", category, content, excerpt, tags, status, scheduledAt,
    event: {
      startAt: eventFields.event_start_at,
      endAt: eventFields.event_end_at,
      registrationUrl: eventFields.event_registration_url,
      registrationDeadline: eventFields.event_registration_deadline,
    },
  });
  const firstError = firstValidationError(errors);
  if (firstError) throw new Error(firstError);

  const slug = await uniqueSlug(supabase, slugBase);

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      title,
      slug,
      content,
      excerpt,
      cover_url: coverUrls[0] ?? null,
      cover_urls: coverUrls,
      cover_meta: coverMeta,
      category,
      tags,
      author_id: user.id,
      status,
      scheduled_at: scheduledAt,
      visibility,
      featured,
      ...((await eventColumnsAvailable()) ? eventFields : {}),
      seo_title: formData.get("seoTitle")?.toString().trim() || null,
      seo_description: formData.get("seoDescription")?.toString().trim() || null,
      og_image: formData.get("ogImage")?.toString().trim() || null,
    })
    .select("id, slug")
    .single();
  if (postError) throw new Error(`Post error: ${postError.message}`);

  const meta = await requestMeta();
  await logAdminAction(user.id, "post.create", "posts", post.id, { title, status, ...meta });

  revalidatePost(post.slug);
  revalidatePath("/admin/posts");
  redirect(`/admin/posts/edit/${post.id}`);
}

// ── updatePost ────────────────────────────────────────────────────
export async function updatePost(postId: string, formData: FormData) {
  const { supabase, user } = await requirePermission("posts", "write");
  await enforceRateLimit(user.id);

  const title = requiredText(formData, "title");
  const content = requiredText(formData, "content");
  const category = normalizeCategory(requiredText(formData, "category"));
  const excerpt = deriveExcerpt(content, formData.get("excerpt")?.toString() ?? null);
  const coverUrls = parseCoverUrls(formData);
  const coverMeta = parseCoverMeta(formData);
  const tags = parseTags(formData);
  const { status, scheduledAt, visibility } = readPublishFields(formData);
  const eventFields = readEventFields(formData, category);
  const featured = readFeatured(formData);

  const requestedSlug = formData.get("slug")?.toString().trim();
  const slugBase = slugify(requestedSlug || title);

  const errors = validatePost({
    title, slug: slugBase || "post", category, content, excerpt, tags, status, scheduledAt,
    event: {
      startAt: eventFields.event_start_at,
      endAt: eventFields.event_end_at,
      registrationUrl: eventFields.event_registration_url,
      registrationDeadline: eventFields.event_registration_deadline,
    },
  });
  const firstError = firstValidationError(errors);
  if (firstError) throw new Error(firstError);

  // Fetch existing URLs so we can delete ones that were removed from storage
  const { data: existing } = await supabase
    .from("posts")
    .select("cover_url, cover_urls")
    .eq("id", postId)
    .single();

  const oldUrls: string[] =
    (existing?.cover_urls as string[] | null) ?? (existing?.cover_url ? [existing.cover_url] : []);

  const removedUrls = oldUrls.filter((u) => !coverUrls.includes(u));
  for (const u of removedUrls) {
    await zimaDelete(u).catch(() => null);
  }

  const slug = await uniqueSlug(supabase, slugBase, postId);

  const { data: post, error: postError } = await supabase
    .from("posts")
    .update({
      title,
      slug,
      content,
      excerpt,
      category,
      tags,
      status,
      scheduled_at: scheduledAt,
      visibility,
      featured,
      ...((await eventColumnsAvailable()) ? eventFields : {}),
      cover_url: coverUrls[0] ?? null,
      cover_urls: coverUrls,
      cover_meta: coverMeta,
      seo_title: formData.get("seoTitle")?.toString().trim() || null,
      seo_description: formData.get("seoDescription")?.toString().trim() || null,
      og_image: formData.get("ogImage")?.toString().trim() || null,
    })
    .eq("id", postId)
    .select("id, slug")
    .single();
  if (postError) throw new Error(`Post update failed: ${postError.message}`);

  const meta = await requestMeta();
  await logAdminAction(user.id, "post.update", "posts", post.id, { title, status, ...meta });

  revalidatePost(post.slug);
  revalidatePath("/admin/posts");
  redirect(`/admin/posts/edit/${postId}`);
}

// ── deletePost ────────────────────────────────────────────────────
export async function deletePost(postId: string) {
  const { supabase, user } = await requirePermission("posts", "write");
  await enforceRateLimit(user.id);

  const { data: postData } = await supabase
    .from("posts")
    .select("title, cover_url, cover_urls")
    .eq("id", postId)
    .single();

  // Clear dependent view logs first to avoid foreign key errors
  await supabase.from("view_logs").delete().eq("content_type", "post").eq("content_id", postId);

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  const urls: string[] =
    (postData?.cover_urls as string[] | null) ?? (postData?.cover_url ? [postData.cover_url] : []);
  for (const u of urls) {
    await zimaDelete(u).catch(() => null);
  }

  const meta = await requestMeta();
  await logAdminAction(user.id, "post.delete", "posts", postId, { title: postData?.title, ...meta });

  revalidatePost();
  revalidatePath("/admin/posts");
}

// ── Status transitions ───────────────────────────────────────────
async function setStatus(postId: string, status: PostStatus, extra?: Record<string, unknown>) {
  const { supabase, user } = await requirePermission("posts", "write");
  await enforceRateLimit(user.id);

  const { data: post, error } = await supabase
    .from("posts")
    .update({ status, ...extra })
    .eq("id", postId)
    .select("slug, title")
    .single();
  if (error) throw new Error(`Update failed: ${error.message}`);

  const actionMap: Record<PostStatus, string> = {
    published: "post.publish",
    draft: "post.unpublish",
    scheduled: "post.schedule",
    archived: "post.archive",
  };
  const meta = await requestMeta();
  await logAdminAction(user.id, actionMap[status], "posts", postId, { title: post.title, ...meta });

  revalidatePost(post.slug);
  revalidatePath("/admin/posts");
}

export async function publishPost(postId: string) {
  await setStatus(postId, "published");
}

export async function unpublishPost(postId: string) {
  await setStatus(postId, "draft");
}

export async function archivePost(postId: string) {
  await setStatus(postId, "archived");
}

export async function schedulePost(postId: string, scheduledAt: string) {
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    throw new Error("Scheduled time must be a valid future date/time");
  }
  await setStatus(postId, "scheduled", { scheduled_at: when.toISOString() });
}

// ── duplicatePost ─────────────────────────────────────────────────
export async function duplicatePost(postId: string) {
  const { supabase, user } = await requirePermission("posts", "write");
  await enforceRateLimit(user.id);

  const withEvents = await eventColumnsAvailable();
  // Typed as plain string so supabase-js skips literal-type parsing of the
  // dynamic column list (same pattern as lib/books-data.ts listingSelect).
  const duplicateSelect: string = `title, content, excerpt, category, tags, cover_url, cover_urls, cover_meta, author_id, seo_title, seo_description, og_image${withEvents ? ", event_start_at, event_end_at, event_location, event_format, event_registration_url, event_registration_deadline, event_status_override" : ""}`;
  const { data, error: fetchError } = await supabase
    .from("posts")
    .select(duplicateSelect)
    .eq("id", postId)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = data as any;
  if (fetchError || !source) throw new Error("Post not found");

  const copyTitle = `${source.title} (Copy)`;
  const slug = await uniqueSlug(supabase, slugify(copyTitle));

  const { data: copy, error: insertError } = await supabase
    .from("posts")
    .insert({
      title: copyTitle,
      slug,
      content: source.content,
      excerpt: source.excerpt,
      category: source.category,
      tags: source.tags,
      cover_url: source.cover_url,
      cover_urls: source.cover_urls,
      cover_meta: source.cover_meta,
      author_id: source.author_id ?? user.id,
      seo_title: source.seo_title,
      seo_description: source.seo_description,
      og_image: source.og_image,
      // Copy event details, but never the featured flag — a duplicate must not
      // silently become a second featured story.
      ...(withEvents
        ? {
            event_start_at: source.event_start_at,
            event_end_at: source.event_end_at,
            event_location: source.event_location,
            event_format: source.event_format,
            event_registration_url: source.event_registration_url,
            event_registration_deadline: source.event_registration_deadline,
            event_status_override: source.event_status_override,
          }
        : {}),
      status: "draft",
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`Duplicate failed: ${insertError.message}`);

  const meta = await requestMeta();
  await logAdminAction(user.id, "post.duplicate", "posts", copy.id, { sourceId: postId, title: copyTitle, ...meta });

  revalidatePath("/admin/posts");
  redirect(`/admin/posts/edit/${copy.id}`);
}

// ── Bulk actions ──────────────────────────────────────────────────
export type BulkPostAction = "publish" | "unpublish" | "archive" | "delete" | "category";

export async function bulkUpdatePosts(
  ids: string[],
  action: BulkPostAction,
  payload?: { category?: string },
): Promise<{ success: number; failed: number }> {
  const { supabase, user } = await requirePermission("posts", "write");
  await enforceRateLimit(user.id);

  if (!ids.length) return { success: 0, failed: 0 };

  if (action === "delete") {
    const { data: rows } = await supabase.from("posts").select("id, cover_url, cover_urls").in("id", ids);
    await supabase.from("view_logs").delete().eq("content_type", "post").in("content_id", ids);
    const { error, count } = await supabase.from("posts").delete({ count: "exact" }).in("id", ids);

    for (const row of rows ?? []) {
      const urls: string[] = (row.cover_urls as string[] | null) ?? (row.cover_url ? [row.cover_url] : []);
      for (const u of urls) await zimaDelete(u).catch(() => null);
    }

    const meta = await requestMeta();
    await logAdminAction(user.id, "post.bulk_action", "posts", undefined, { action, ids, ...meta });
    revalidatePost();
    revalidatePath("/admin/posts");
    if (error) return { success: count ?? 0, failed: ids.length - (count ?? 0) };
    return { success: count ?? ids.length, failed: 0 };
  }

  let update: Record<string, unknown>;
  if (action === "category") {
    const category = normalizeCategory(payload?.category ?? "Other");
    update = { category };
  } else {
    const statusMap: Record<Exclude<BulkPostAction, "delete" | "category">, PostStatus> = {
      publish: "published",
      unpublish: "draft",
      archive: "archived",
    };
    update = { status: statusMap[action] };
  }

  const { error, count } = await supabase.from("posts").update(update, { count: "exact" }).in("id", ids);

  const meta = await requestMeta();
  await logAdminAction(user.id, "post.bulk_action", "posts", undefined, { action, ids, payload, ...meta });

  revalidatePost();
  revalidatePath("/admin/posts");
  if (error) return { success: 0, failed: ids.length };
  return { success: count ?? ids.length, failed: 0 };
}
