/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import Markdown, { extractToc, computeReadingTime } from "./Markdown";
import ViewTracker from "./ViewTracker";
import ReadingProgress from "./ReadingProgress";
import EngagementBar from "./EngagementBar";
import ShareSection from "./ShareSection";
import ImageGallery from "./ImageGallery";
import RelatedPosts from "./RelatedPosts";
import { SITE_URL } from "@/lib/seo/site";
import { getTranslations } from "next-intl/server";

const categoryBadgeStyles: Record<string, string> = {
  Research:     "bg-blue-50 text-blue-700 border border-blue-200",
  Announcement: "bg-gold-50 text-gold-700 border border-gold-200",
  Event:        "bg-orange-50 text-orange-700 border border-orange-100",
  Journal:      "bg-teal-50 text-teal-700 border border-teal-100",
  Other:        "bg-paper text-text-muted border border-divider",
};

const heroBadgeStyles: Record<string, string> = {
  Research:     "bg-blue-500 text-white",
  Announcement: "bg-gold-500 text-blue-950",
  Event:        "bg-orange-500 text-white",
  Journal:      "bg-teal-500 text-white",
  Other:        "bg-white/20 text-white",
};

function formatDate(iso: string | null, locale = "km-KH"): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select("title, excerpt, cover_url, created_at, author:profiles!author_id(full_name, email)")
    .eq("slug", slug)
    .single();

  if (!post) return { title: "Post not found" };

  const desc = post.excerpt
    ? post.excerpt.length > 157 ? post.excerpt.substring(0, 157) + "..." : post.excerpt
    : "Read this article on PTEC Library.";

  const authorName = (post.author as any)?.full_name ?? (post.author as any)?.email ?? "PTEC Library";
  const canonicalUrl = `${SITE_URL}/posts/${slug}`;

  return {
    title: post.title,
    description: desc,
    alternates: { canonical: canonicalUrl, languages: { en: canonicalUrl, km: canonicalUrl, "x-default": canonicalUrl } },
    openGraph: {
      title: post.title,
      description: desc,
      type: "article",
      url: canonicalUrl,
      publishedTime: post.created_at ?? undefined,
      authors: [authorName],
      images: post.cover_url ? [{ url: post.cover_url, width: 1200, height: 630, alt: post.title }] : [],
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
  const t = await getTranslations("posts");
  const { slug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    isAdmin = profile?.role === "admin";
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(`
      id, title, slug, content, excerpt, cover_url, cover_urls, category,
      is_published, views, created_at, updated_at,
      author:profiles!author_id ( full_name, email )
    `)
    .eq("slug", slug)
    .single();

  if (postError) {
    console.error("[PostDetailPage] Supabase error for slug=%s:", slug, postError.message, postError.code);
  }
  if (!post || (!post.is_published && !isAdmin)) notFound();

  const author = (post.author as any)?.full_name ?? (post.author as any)?.email ?? "PTEC Library";
  const authorInitial = getInitial(author);

  const coverUrls: string[] =
    Array.isArray((post as any).cover_urls) && (post as any).cover_urls.length > 0
      ? (post as any).cover_urls
      : (post as any).cover_url ? [(post as any).cover_url] : [];

  const coverUrl = coverUrls[0] ?? null;
  const categoryLabel = t(`category${post.category}` as any);
  const readingTime = computeReadingTime(post.content ?? "");
  const toc = extractToc(post.content ?? "");
  const publishedDate = formatDate(post.created_at);

  const { data: relatedPosts } = await supabase
    .from("posts")
    .select("id, title, slug, cover_url, cover_urls, category, created_at")
    .eq("category", post.category)
    .eq("is_published", true)
    .neq("slug", slug)
    .order("created_at", { ascending: false })
    .limit(3);

  const postSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || undefined,
    url: `${SITE_URL}/posts/${slug}`,
    image: coverUrls,
    datePublished: post.created_at || undefined,
    dateModified: post.updated_at || post.created_at || undefined,
    isAccessibleForFree: true,
    author: { "@type": "Person", name: author },
    publisher: {
      "@type": "EducationalOrganization",
      name: "Phnom Penh Teacher Education College",
      url: SITE_URL,
    },
  };

  return (
    <article className="min-h-screen bg-bg-app">
      <JsonLd data={postSchema} />
      <ViewTracker postId={post.id} />
      <ReadingProgress />

      {/* ── Full-bleed hero ── */}
      <section
        className="relative flex bg-blue-950 pt-[72px]"
        style={{ minHeight: "clamp(380px,52vh,560px)" }}
      >
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={post.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/25 via-blue-950/55 to-blue-950/95" />

        <div className="relative max-w-[1180px] w-full mx-auto px-5 pb-10 pt-10 flex flex-col justify-end gap-4">
          {/* Back link */}
          <Link
            href="/posts"
            className="inline-flex items-center gap-2 text-white/85 text-sm font-semibold hover:text-gold-300 transition-colors w-fit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
            {t("backToPosts")}
          </Link>

          {/* Category badge */}
          <span className={`self-start text-xs font-bold tracking-wide px-3.5 py-1.5 rounded-full ${heroBadgeStyles[post.category] ?? heroBadgeStyles.Other}`}>
            {categoryLabel}
          </span>

          {/* Title */}
          {!post.is_published && (
            <span className="self-start rounded-full bg-amber-400/20 border border-amber-300/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
              {t("draftPreview")}
            </span>
          )}
          <h1 className="font-title text-white leading-[1.5] m-0 max-w-[20ch] text-wrap-pretty drop-shadow-lg"
            style={{ fontSize: "clamp(22px,3.8vw,40px)" }}>
            {post.title}
          </h1>

          {/* Meta row */}
          <div className="flex items-center gap-5 flex-wrap text-white/90 text-sm">
            <span className="inline-flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-white/16 backdrop-blur-sm flex items-center justify-center font-khmer-serif font-bold text-white text-base flex-none">
                {authorInitial}
              </span>
              <span className="font-semibold text-white">{author}</span>
            </span>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
              </svg>
              {publishedDate}
            </span>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5V6a2 2 0 012-2h12v16H6.5a2.5 2.5 0 010-5H18"/>
              </svg>
              អានរយៈពេល {readingTime} នាទី
            </span>
            {isAdmin && (
              <>
                <span className="opacity-50">·</span>
                <Link
                  href={`/admin/posts/edit/${post.id}`}
                  className="rounded-lg bg-white/15 border border-white/25 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25 transition-colors"
                >
                  {t("editPost")}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Content grid ── */}
      <div className="max-w-[1180px] mx-auto px-5 py-10 pb-16 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12 items-start">

        {/* ── Article column ── */}
        <div className="min-w-0">

          {/* Excerpt / lead */}
          {post.excerpt && (
            <div className="flex gap-4 mb-8">
              <span className="w-1 bg-accent rounded-full flex-none" />
              <p className="m-0 text-slate-700 font-medium text-xl leading-[1.9] font-khmer-serif">
                {post.excerpt}
              </p>
            </div>
          )}

          {/* Markdown body */}
          <div className="prose-content font-sans khmer">
            <Markdown content={post.content ?? ""} />
          </div>

          {/* Image gallery */}
          {coverUrls.length > 1 && (
            <div className="mt-8">
              <ImageGallery urls={coverUrls} alt={post.title} />
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-divider">
            <span className={`text-sm px-3.5 py-1.5 rounded-full border cursor-default ${categoryBadgeStyles[post.category] ?? categoryBadgeStyles.Other}`}>
              #{categoryLabel}
            </span>
            <span className="text-sm text-slate-600 bg-paper border border-border px-3.5 py-1.5 rounded-full">#PTEC</span>
            <span className="text-sm text-slate-600 bg-paper border border-border px-3.5 py-1.5 rounded-full">#បណ្ណាល័យ</span>
          </div>

          {/* Engagement bar */}
          <EngagementBar viewCount={post.views ?? 0} />

          {/* Author card */}
          <div className="flex gap-4 items-start mt-10 bg-white border border-divider rounded-xl p-6 shadow-sm">
            <span className="w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center font-khmer-serif font-bold text-2xl flex-none">
              {authorInitial}
            </span>
            <div>
              <div className="text-text-muted text-xs tracking-widest uppercase mb-0.5">សរសេរដោយ</div>
              <div className="text-text-heading font-bold text-lg font-khmer-serif">{author}</div>
              <p className="m-0 mt-1.5 text-sm leading-relaxed text-text-body">
                បុគ្គលិករបស់បណ្ណាល័យ វ.គ.ភ. — Phnom Penh Teacher Education College
              </p>
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-[90px]">
          {/* Quick facts */}
          <div className="bg-white border border-divider rounded-xl p-5 shadow-sm">
            <h3 className="font-khmer-serif font-bold text-text-heading text-lg mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-accent rounded-full" />
              ព័ត៌មានសង្ខេប
            </h3>
            <div className="flex flex-col">
              <div className="flex items-center justify-between py-2.5 border-b border-divider text-sm">
                <span className="text-text-muted">ថ្ងៃផ្សាយ</span>
                <span className="text-text-heading font-semibold">{publishedDate}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-divider text-sm">
                <span className="text-text-muted">ប្រភេទ</span>
                <span className="text-brand font-semibold">{categoryLabel}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-divider text-sm">
                <span className="text-text-muted">រយៈពេលអាន</span>
                <span className="text-text-heading font-semibold">{readingTime} នាទី</span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-text-muted">អ្នកមើល</span>
                <span className="text-text-heading font-semibold">{(post.views ?? 0).toLocaleString()} ដង</span>
              </div>
            </div>
          </div>

          {/* Table of contents */}
          {toc.length > 0 && (
            <div className="bg-white border border-divider rounded-xl p-5 shadow-sm">
              <h3 className="font-khmer-serif font-bold text-text-heading text-lg mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-accent rounded-full" />
                មាតិកា
              </h3>
              <div className="flex flex-col gap-0.5">
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="text-text-body text-sm py-2 pl-3 border-l-2 border-border hover:text-brand hover:border-gold-500 hover:pl-4 transition-all"
                  >
                    {item.text}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Share section */}
          <ShareSection postTitle={post.title} />
        </aside>
      </div>

      {/* ── Related posts ── */}
      <RelatedPosts posts={relatedPosts ?? []} category={post.category} />
    </article>
  );
}
