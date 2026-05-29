"use server";

// app/admin/posts/actions.ts
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { deleteR2File } from "@/app/actions/upload";

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

function storagePathFromUrl(publicUrl: string): string | null {
  try {
    const url = new URL(publicUrl);
    const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
    if (r2Base && publicUrl.startsWith(r2Base)) {
      let path = publicUrl.slice(r2Base.length);
      if (path.startsWith('/')) path = path.slice(1);
      return decodeURIComponent(path);
    }
    const marker = "/object/public/post-files/";
    const idx = url.pathname.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(url.pathname.slice(idx + marker.length));
    }
    return null;
  } catch {
    return null;
  }
}

async function uniqueSlug(
  supabase: ReturnType<typeof createServiceClient>,
  base: string,
  ignoreId?: string
): Promise<string> {
  let slug = base || "post";
  let n = 1;
  while (true) {
    const { data } = await supabase.from("posts").select("id").eq("slug", slug).limit(1);
    const taken = (data ?? []).some((r: any) => r.id !== ignoreId);
    if (!taken) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/** Parse coverUrls JSON string from FormData → string[] */
function parseCoverUrls(formData: FormData): string[] {
  const raw = formData.get("coverUrls");
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === "string" && u) : [];
  } catch {
    return [];
  }
}

// ── createPost ────────────────────────────────────────────────────
export async function createPost(formData: FormData) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  const title    = requiredText(formData, "title");
  const content  = requiredText(formData, "content");
  const category = normalizeCategory(requiredText(formData, "category"));
  const excerpt  = deriveExcerpt(content, formData.get("excerpt")?.toString() ?? null);
  const isPublished = formData.get("isPublished")?.toString() === "true";
  const coverUrls   = parseCoverUrls(formData);

  const slug = await uniqueSlug(supabase, slugify(title));

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      title,
      slug,
      content,
      excerpt,
      cover_url:    coverUrls[0] ?? null,   // keep cover_url for backwards compat
      cover_urls:   coverUrls,               // new array column
      category,
      author_id:    user.id,
      is_published: isPublished,
    })
    .select("id, slug")
    .single();
  if (postError) throw new Error(`Post error: ${postError.message}`);

  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  revalidatePath("/admin/posts");
  redirect(`/posts/${post.slug}`);
}

// ── updatePost ────────────────────────────────────────────────────
export async function updatePost(postId: string, formData: FormData) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  const title    = requiredText(formData, "title");
  const content  = requiredText(formData, "content");
  const category = normalizeCategory(requiredText(formData, "category"));
  const excerpt  = deriveExcerpt(content, formData.get("excerpt")?.toString() ?? null);
  const isPublished = formData.get("isPublished")?.toString() === "true";
  const coverUrls   = parseCoverUrls(formData);

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
    const p = storagePathFromUrl(u);
    if (p) {
      await deleteR2File(p);
    }
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .update({
      title,
      content,
      excerpt,
      category,
      is_published: isPublished,
      cover_url:    coverUrls[0] ?? null,
      cover_urls:   coverUrls,
    })
    .eq("id", postId)
    .select("id, slug")
    .single();
  if (postError) throw new Error(`Post update failed: ${postError.message}`);

  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  revalidatePath("/admin/posts");
  redirect(`/posts/${post.slug}`);
}

// ── deletePost ────────────────────────────────────────────────────
export async function deletePost(postId: string) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  const { data: postData } = await supabase
    .from("posts")
    .select("cover_url, cover_urls")
    .eq("id", postId)
    .single();

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  // Clean up all images from storage
  const urls: string[] = (postData?.cover_urls as string[] | null) ??
    (postData?.cover_url ? [postData.cover_url] : []);
  for (const u of urls) {
    const p = storagePathFromUrl(u);
    if (p) await deleteR2File(p);
  }

  revalidatePath("/posts");
  revalidatePath("/admin/posts");
}

// ── togglePublish ─────────────────────────────────────────────────
export async function togglePublish(postId: string, nextState: boolean) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  const { data: post, error } = await supabase
    .from("posts")
    .update({ is_published: nextState })
    .eq("id", postId)
    .select("slug")
    .single();
  if (error) throw new Error(`Toggle failed: ${error.message}`);

  revalidatePath("/posts");
  revalidatePath(`/posts/${post.slug}`);
  revalidatePath("/admin/posts");
}

// ── incrementViews ────────────────────────────────────────────────
export async function incrementViews(postId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase.from("posts").select("views").eq("id", postId).single();
  if (!data) return;
  await supabase.from("posts").update({ views: (data.views ?? 0) + 1 }).eq("id", postId);
}