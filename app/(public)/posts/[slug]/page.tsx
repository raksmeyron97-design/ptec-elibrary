/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/posts/[slug]/page.tsx
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import Markdown from "./Markdown";
import ViewTracker from "./ViewTracker";

import { SITE_URL } from "@/lib/seo/site";
import ImageGallery from "./ImageGallery";
import RelatedPosts from "./RelatedPosts";
import { getTranslations } from 'next-intl/server';

const categoryStyles: Record<string, string> = {
  Research:     "bg-brand/5 text-brand border border-divider",
  Announcement: "bg-amber-50 text-amber-700 border border-amber-100",
  Event:        "bg-orange-50 text-orange-700 border border-orange-100",
  Journal:      "bg-teal-50 text-teal-700 border border-teal-100",
  Other:        "bg-paper text-text-muted border border-divider",
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
    .select("title, excerpt, cover_url, created_at, author:profiles(full_name, email)")
    .eq("slug", slug)
    .single();

  if (!post) {
    return { title: "Post not found" };
  }

  const desc = post.excerpt
    ? (post.excerpt.length > 157 ? post.excerpt.substring(0, 157) + "..." : post.excerpt)
    : "Read this article on PTEC Library.";

  const authorName = (post.author as any)?.full_name ?? (post.author as any)?.email ?? "PTEC Library";
  const canonicalUrl = `${SITE_URL}/posts/${slug}`;

  return {
    title: post.title,
    description: desc,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: canonicalUrl,
        km: canonicalUrl,
        'x-default': canonicalUrl,
      },
    },
    openGraph: {
      title: post.title,
      description: desc,
      type: "article",
      url: canonicalUrl,
      publishedTime: post.created_at ?? undefined,
      authors: [authorName],
      images: post.cover_url
        ? [
            {
              url: post.cover_url,
              width: 1200,
              height: 630,
              alt: post.title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: desc,
      images: post.cover_url ? [post.cover_url] : undefined,
    },
  };
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await getTranslations('posts');
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

  const postSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    image: coverUrls,
    datePublished: post.created_at || undefined,
    dateModified: post.updated_at || post.created_at || undefined,
    author: {
      "@type": "Person",
      name: author,
    },
    publisher: {
      "@type": "Organization",
      name: "Phnom Penh Teacher Education College",
    },
  };

  return (
    <article className="min-h-screen bg-bg-body pb-20 pt-[72px]">
      <JsonLd data={postSchema} />
      <ViewTracker postId={post.id} />

      {/* ── Main grid: 70% content | 30% sidebar ── */}
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[70%_1fr]">

          {/* ── LEFT: hero + main content (70%) ── */}
          <div className="min-w-0">

            {/* ── Hero banner: inside left column so it respects 70% ── */}
            {coverUrls.length > 0 ? (
              <div className="relative h-[200px] sm:h-[280px] md:h-[340px] w-full overflow-hidden rounded-2xl shadow-sm border border-divider">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrls[0]}
                  alt={post.title}
                  className="h-full w-full object-cover"
                />
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                {/* Title pinned to bottom */}
                <div className="absolute inset-x-0 bottom-0 px-4 pb-4 sm:px-6 sm:pb-6">
                  <h1 className="font-khmer-serif font-bold text-2xl sm:text-3xl leading-[1.3] sm:leading-[1.4] text-white drop-shadow-lg md:text-4xl">
                    {post.title}
                  </h1>
                </div>
              </div>
            ) : (
              <div className={`flex h-36 sm:h-44 items-end rounded-2xl shadow-sm border border-divider bg-gradient-to-br ${pickBanner(post.title)} px-4 pb-4 sm:px-6 sm:pb-6`}>
                <h1 className="font-khmer-serif font-bold text-2xl sm:text-3xl leading-[1.3] sm:leading-[1.4] text-white md:text-4xl">
                  {post.title}
                </h1>
              </div>
            )}

            {/* Top bar */}
            <div className="flex items-center justify-between py-4 sm:py-6">
              <Link href="/posts"
                className="inline-flex items-center gap-2 text-sm font-semibold text-text-muted transition hover:text-brand">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                {t('backToPosts')}
              </Link>
              {isAdmin && (
                <Link href={`/admin/posts/edit/${post.id}`}
                  className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-brand-contrast transition hover:bg-brand-hover shadow-sm">
                  {t('editPost')}
                </Link>
              )}
            </div>

            {/* Meta */}
            <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-text-muted">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${categoryStyles[post.category] ?? categoryStyles.Other}`}>
                {t(`category${post.category}` as any)}
              </span>
              <span className="font-medium text-text-body">{author}</span>
              <span aria-hidden className="hidden sm:inline text-divider">·</span>
              <span className="tabular-nums text-[13px] sm:text-sm">{formatDate(post.created_at)}</span>
              <span aria-hidden className="hidden sm:inline text-divider">·</span>
              <span className="inline-flex items-center gap-1 tabular-nums text-[13px] sm:text-sm">
                <svg className="h-3.5 w-3.5 text-text-muted" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                {t(post.views === 1 ? 'views' : 'viewsPlural', { count: post.views ?? 0 })}
              </span>
              {!post.is_published && (
                <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  {t('draftPreview')}
                </span>
              )}
            </div>

            {/* Excerpt */}
            {post.excerpt && (
              <p className="mb-5 sm:mb-6 border-l-2 border-brand/40 pl-4 font-sans text-base sm:text-lg leading-[1.8] text-text-muted">
                {post.excerpt}
              </p>
            )}

            <hr className="my-6 border-divider" />

            {/* Markdown content */}
            <div className="prose-content font-sans khmer">
              <Markdown content={post.content} />
            </div>

            {/* Image gallery (below content) */}
            {coverUrls.length > 0 && (
              <div className="mt-7 sm:mt-10">
                <ImageGallery urls={coverUrls} alt={post.title} />
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 sm:mt-12 border-t border-divider pt-5 sm:pt-6">
              <Link href="/posts"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover shadow-sm">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                {t('backToPosts')}
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