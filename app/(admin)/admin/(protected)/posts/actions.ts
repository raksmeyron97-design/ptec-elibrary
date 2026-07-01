"use server";

// app/admin/posts/actions.ts
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { zimaDelete } from "@/lib/zima";
import { logAdminAction } from "@/app/actions/audit";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const VALID_CATEGORIES = ["Research", "Announcement", "Event", "Journal", "Other"];
function normalizeCategory(raw: string): string {
  return VALID_CATEGORIES.includes(raw) ? raw : "Other";
}

function deriveExcerpt(content: string, provided: string | null): string | null {
  if (provided && provided.trim()) return provided.trim().slice(0, 300);
  const plain = content.replace(/[#*_`>\-\[\]()!]/g, "").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  return plain.length > 150 ? `${plain.slice(0, 150).trimEnd()}…` : plain;
}


async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof requirePermission>>["supabase"],
  base: string,
  ignoreId?: string
): Promise<string> {
  let slug = base || "post";
  let n = 1;
  while (true) {
    const { data } = await supabase.from("posts").select("id").eq("slug", slug).limit(1);
    const taken = (data ?? []).some((r: { id: string }) => r.id !== ignoreId);
    if (!taken) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
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

const parseCoverUrls = (fd: FormData) => parseStringArray(fd, "coverUrls");
const parseTags      = (fd: FormData) => parseStringArray(fd, "tags").slice(0, 10);

// ── createPost ────────────────────────────────────────────────────
export async function createPost(formData: FormData) {
  const { supabase, user } = await requirePermission("posts", "write");

  const title    = requiredText(formData, "title");
  const content  = requiredText(formData, "content");
  const category = normalizeCategory(requiredText(formData, "category"));
  const excerpt  = deriveExcerpt(content, formData.get("excerpt")?.toString() ?? null);
  const isPublished = formData.get("isPublished")?.toString() === "true";
  const coverUrls   = parseCoverUrls(formData);
  const tags        = parseTags(formData);

  const slug = await uniqueSlug(supabase, slugify(title));

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      title,
      slug,
      content,
      excerpt,
      cover_url:    coverUrls[0] ?? null,
      cover_urls:   coverUrls,
      category,
      tags,
      author_id:    user.id,
      is_published: isPublished,
    })
    .select("id, slug")
    .single();
  if (postError) throw new Error(`Post error: ${postError.message}`);

  await logAdminAction(user.id, "createPost", "posts", post.id, { title });

  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  revalidatePath("/admin/posts");
  redirect(`/posts/${post.slug}`);
}

// ── updatePost ────────────────────────────────────────────────────
export async function updatePost(postId: string, formData: FormData) {
  const { supabase, user } = await requirePermission("posts", "write");

  const title    = requiredText(formData, "title");
  const content  = requiredText(formData, "content");
  const category = normalizeCategory(requiredText(formData, "category"));
  const excerpt  = deriveExcerpt(content, formData.get("excerpt")?.toString() ?? null);
  const isPublished = formData.get("isPublished")?.toString() === "true";
  const coverUrls   = parseCoverUrls(formData);
  const tags        = parseTags(formData);

  // Fetch existing URLs so we can delete ones that were removed from storage
  const { data: existing } = await supabase
    .from("posts")
    .select("cover_url, cover_urls")
    .eq("id", postId)
    .single();

  const oldUrls: string[] = (existing?.cover_urls as string[] | null) ??
    (existing?.cover_url ? [existing.cover_url] : []);

  // Delete storage objects that are no longer in the new list
  const removedUrls = oldUrls.filter((u) => !coverUrls.includes(u));
  for (const u of removedUrls) {
    await zimaDelete(u).catch(() => null);
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .update({
      title,
      content,
      excerpt,
      category,
      tags,
      is_published: isPublished,
      cover_url:    coverUrls[0] ?? null,
      cover_urls:   coverUrls,
    })
    .eq("id", postId)
    .select("id, slug")
    .single();
  if (postError) throw new Error(`Post update failed: ${postError.message}`);

  await logAdminAction(user.id, "updatePost", "posts", post.id, { title });

  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  revalidatePath("/admin/posts");
  redirect(`/posts/${post.slug}`);
}

// ── deletePost ────────────────────────────────────────────────────
export async function deletePost(postId: string) {
  const { supabase, user } = await requirePermission("posts", "write");

  const { data: postData } = await supabase
    .from("posts")
    .select("cover_url, cover_urls")
    .eq("id", postId)
    .single();

  // Clear dependent view logs first to avoid foreign key errors
  await supabase.from("view_logs").delete().eq("content_type", "post").eq("content_id", postId);

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  // Clean up all images from storage
  const urls: string[] = (postData?.cover_urls as string[] | null) ??
    (postData?.cover_url ? [postData.cover_url] : []);
  for (const u of urls) {
    await zimaDelete(u).catch(() => null);
  }

  await logAdminAction(user.id, "deletePost", "posts", postId);

  revalidatePath("/posts");
  revalidatePath("/admin/posts");
}

// ── togglePublish ─────────────────────────────────────────────────
export async function togglePublish(postId: string, nextState: boolean) {
  const { supabase, user } = await requirePermission("posts", "write");

  const { data: post, error } = await supabase
    .from("posts")
    .update({ is_published: nextState })
    .eq("id", postId)
    .select("slug")
    .single();
  if (error) throw new Error(`Toggle failed: ${error.message}`);

  await logAdminAction(user.id, "togglePublishPost", "posts", postId, { is_published: nextState });

  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  revalidatePath("/admin/posts");
}
