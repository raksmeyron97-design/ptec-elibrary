// app/admin/posts/edit/[id]/page.tsx
import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PostForm, { type PostInitial } from "../../PostForm";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createServiceClient();

  const { data: post } = await supabase
    .from("posts")
    .select("id, title, category, excerpt, content, cover_url, cover_urls, is_published, slug, tags")
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
    id:          post.id,
    title:       post.title,
    category:    post.category ?? "Other",
    excerpt:     post.excerpt ?? null,
    content:     post.content,
    coverUrls,
    isPublished: post.is_published,
    tags:        Array.isArray(post.tags) ? (post.tags as string[]) : [],
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      {/* Edit form */}
      <PostForm initial={initial} />
    </div>
  );
}