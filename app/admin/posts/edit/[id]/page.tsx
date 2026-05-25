// app/admin/posts/edit/[id]/page.tsx
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PostForm, { type PostInitial } from "../../PostForm";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect(`/auth/login?callbackUrl=/admin/posts/edit/${id}`);

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/books");

  const { data: post } = await supabase
    .from("posts")
    .select("id, title, category, excerpt, content, cover_url, cover_urls, is_published, slug")
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
    coverUrls,                        // ← array (replaces coverUrl)
    isPublished: post.is_published,
  };

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[1100px] space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl bg-[#0a1629] p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-cyan-100">
              <Icon name="pdf" className="text-base" />
              Posts administration
            </div>
            <h1 className="font-[family-name:var(--font-angkor)] text-3xl">Edit Post</h1>
            <p className="mt-2 text-sm text-slate-300 line-clamp-1">{post.title}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/posts/${post.slug}`}
              target="_blank"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 px-5 font-semibold text-white transition hover:bg-white/10"
            >
              View
            </Link>
            <Link
              href="/admin/posts"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 font-semibold text-slate-900 transition hover:bg-cyan-50"
            >
              ← All posts
            </Link>
          </div>
        </div>

        {/* Edit form */}
        <PostForm initial={initial} />

      </div>
    </section>
  );
}