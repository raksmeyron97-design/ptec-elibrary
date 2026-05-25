// app/posts/[slug]/page.tsx
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Markdown from "./Markdown";
import ViewTracker from "./ViewTracker";
import ImageGallery from "./ImageGallery";
import RelatedPosts from "./RelatedPosts";

const categoryStyles: Record<string, string> = {
  Research:     "bg-cyan-50 text-cyan-700",
  Announcement: "bg-violet-50 text-violet-700",
  Event:        "bg-orange-50 text-orange-700",
  Journal:      "bg-blue-50 text-blue-700",
  Other:        "bg-slate-100 text-slate-600",
};

const bannerColors = [
  "from-[#0f766e] to-[#0a1629]",
  "from-[#2563eb] to-[#0a1629]",
  "from-[#7c3aed] to-[#0a1629]",
  "from-[#0891b2] to-[#0a1629]",
  "from-[#ca8a04] to-[#0a1629]",
  "from-[#ea580c] to-[#0a1629]",
  "from-[#dc2626] to-[#0a1629]",
  "from-[#4f46e5] to-[#0a1629]",
];

function pickBanner(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  return bannerColors[Math.abs(hash) % bannerColors.length];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data: post } = await supabase
    .from("posts")
    .select("title, excerpt")
    .eq("slug", slug)
    .single();

  if (!post) return { title: "Post not found · PTEC Library" };
  return {
    title: `${post.title} · PTEC Library`,
    description: post.excerpt ?? undefined,
  };
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const supabase = createServiceClient();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    isAdmin = profile?.role === "admin";
  }

  const { data: post } = await supabase
    .from("posts")
    .select(`
      id, title, slug, content, excerpt, cover_url, cover_urls, category,
      is_published, views, created_at, updated_at,
      author:profiles ( full_name, email )
    `)
    .eq("slug", slug)
    .single();

  if (!post || (!post.is_published && !isAdmin)) notFound();

  const author = (post.author as any)?.full_name ?? (post.author as any)?.email ?? "PTEC Library";

  // Resolve images: prefer cover_urls array, fall back to single cover_url
  const coverUrls: string[] =
    Array.isArray((post as any).cover_urls) && (post as any).cover_urls.length > 0
      ? (post as any).cover_urls
      : (post as any).cover_url
      ? [(post as any).cover_url]
      : [];

  // ── Fetch related posts (same category, exclude current, latest 4) ──
  const { data: relatedPosts } = await supabase
    .from("posts")
    .select("id, title, slug, cover_url, cover_urls, category, created_at")
    .eq("category", post.category)
    .eq("is_published", true)
    .neq("slug", slug)
    .order("created_at", { ascending: false })
    .limit(4);

  return (
    <article className="min-h-screen bg-slate-50 pb-20 pt-[72px]">
      <ViewTracker postId={post.id} />

      {/* ── Main grid: 70% content | 30% sidebar ── */}
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[70%_1fr]">

          {/* ── LEFT: hero + main content (70%) ── */}
          <div className="min-w-0">

            {/* ── Hero banner: inside left column so it respects 70% ── */}
            {coverUrls.length > 0 ? (
              <div className="relative h-[340px] w-full overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrls[0]}
                  alt={post.title}
                  className="h-full w-full object-cover"
                />
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                {/* Title pinned to bottom */}
                <div className="absolute inset-x-0 bottom-0 px-6 pb-6">
                  <h1 className="font-title text-3xl leading-tight text-white drop-shadow-lg md:text-4xl">
                    {post.title}
                  </h1>
                </div>
              </div>
            ) : (
              <div className={`flex h-44 items-end rounded-xl bg-gradient-to-br ${pickBanner(post.title)} px-6 pb-6`}>
                <h1 className="font-title text-3xl leading-tight text-white md:text-4xl">
                  {post.title}
                </h1>
              </div>
            )}

            {/* Top bar */}
            <div className="flex items-center justify-between py-6">
              <Link href="/posts"
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-[#007c91]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                Back to Posts
              </Link>
              {isAdmin && (
                <Link href={`/admin/posts/edit/${post.id}`}
                  className="rounded-lg bg-[#0a1629] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#007c91]">
                  Edit post
                </Link>
              )}
            </div>

            {/* Meta */}
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${categoryStyles[post.category] ?? categoryStyles.Other}`}>
                {post.category}
              </span>
              <span className="font-medium text-slate-600">{author}</span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">{formatDate(post.created_at)}</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                {(post.views ?? 0).toLocaleString()} view{post.views === 1 ? "" : "s"}
              </span>
              {!post.is_published && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                  Draft preview
                </span>
              )}
            </div>

            {/* Excerpt */}
            {post.excerpt && (
              <p className="mb-6 border-l-2 border-slate-200 pl-4 font-body text-lg leading-relaxed text-slate-500">
                {post.excerpt}
              </p>
            )}

            <hr className="my-6 border-slate-200" />

            {/* Markdown content */}
            <div className="prose-content font-body">
              <Markdown content={post.content} />
            </div>

            {/* Image gallery (below content) */}
            {coverUrls.length > 0 && (
              <div className="mt-10">
                <ImageGallery urls={coverUrls} alt={post.title} />
              </div>
            )}

            {/* Footer */}
            <div className="mt-12 border-t border-slate-200 pt-6">
              <Link href="/posts"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0a1629] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#007c91]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                Back to Posts
              </Link>
            </div>
          </div>

          {/* ── RIGHT: related posts sidebar (30%) ── */}
          <div className="lg:pt-2">
            <div className="sticky top-24">
              <RelatedPosts posts={relatedPosts ?? []} category={post.category} />
            </div>
          </div>

        </div>
      </div>
    </article>
  );
}