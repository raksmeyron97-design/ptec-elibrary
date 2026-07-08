// app/admin/posts/edit/[id]/page.tsx
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PostForm, { type PostInitial } from "@/components/admin/posts/PostForm";
import { normalizeCategory, normalizeStatus, normalizeVisibility } from "@/lib/admin/posts-shared";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createServiceClient();

  const { data: post } = await supabase
    .from("posts")
    .select(
      `
      id, title, slug, category, excerpt, content, cover_url, cover_urls, cover_meta,
      status, scheduled_at, visibility, seo_title, seo_description, og_image, tags, created_at
    `,
    )
    .eq("id", id)
    .single();

  if (!post) notFound();

  // Resolve to array — prefer cover_urls, fall back to cover_url string
  const coverUrls: string[] =
    Array.isArray(post.cover_urls) && (post.cover_urls as string[]).length > 0
      ? (post.cover_urls as string[])
      : post.cover_url
        ? [post.cover_url]
        : [];

  const initial: PostInitial = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    category: normalizeCategory(post.category),
    excerpt: post.excerpt ?? null,
    content: post.content,
    coverUrls,
    coverMeta: (post.cover_meta as PostInitial["coverMeta"]) ?? {},
    tags: Array.isArray(post.tags) ? (post.tags as string[]) : [],
    status: normalizeStatus(post.status),
    scheduledAt: post.scheduled_at ?? null,
    visibility: normalizeVisibility(post.visibility),
    seoTitle: post.seo_title ?? null,
    seoDescription: post.seo_description ?? null,
    ogImage: post.og_image ?? null,
    createdAt: post.created_at ?? null,
  };

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  let authorName = "You";
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    authorName = profile?.full_name ?? profile?.email ?? "You";
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <PostForm initial={initial} authorName={authorName} />
    </div>
  );
}
