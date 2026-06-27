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
import CommentsSection from "./CommentsSection";
import TableOfContents from "./TableOfContents";
import { SITE_URL } from "@/lib/seo/site";
import { getTranslations } from "next-intl/server";

const categoryBadgeStyles: Record<string, string> = {
  Research:     "bg-blue-50 text-blue-700 border border-blue-200",
  Announcement: "bg-amber-50 text-amber-700 border border-amber-200",
  Event:        "bg-orange-50 text-orange-700 border border-orange-100",
  Journal:      "bg-teal-50 text-teal-700 border border-teal-100",
  Other:        "bg-paper text-text-muted border border-divider",
};

const heroBadgeStyles: Record<string, string> = {
  Research:     "bg-blue-500 text-white",
  Announcement: "bg-amber-500 text-white",
  Event:        "bg-orange-500 text-white",
  Journal:      "bg-teal-500 text-white",
  Other:        "bg-white/20 text-white",
};

function formatDate(iso: string | null, locale = "km-KH"): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric", month: "long", day: "numeric",
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
      id, title, slug, content, excerpt, cover_url, cover_urls, category, tags,
      is_published, views, like_count, save_count, created_at, updated_at,
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

  // Fetch user's like/save state for this post
  let initialLiked = false;
  let initialSaved = false;
  if (user) {
    const [likeRes, saveRes] = await Promise.all([
      supabase.from("post_likes").select("post_id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle(),
      supabase.from("post_saves").select("post_id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle(),
    ]);
    initialLiked = !!likeRes.data;
    initialSaved = !!saveRes.data;
  }

  const postTags: string[] = Array.isArray((post as any).tags) ? (post as any).tags : [];

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

  const { data: rawComments } = await supabase
    .from("post_comments")
    .select("id, body, created_at, user_id, parent_id, is_edited, author:profiles!user_id(full_name, email)")
    .eq("post_id", post.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  const initialComments = (rawComments ?? []) as any[];

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

      {/* ── Hero ── */}
      <section
        className="relative flex bg-blue-950 pt-[72px]"
        style={{ minHeight: "clamp(360px, 50vh, 540px)" }}
      >
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={post.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 via-blue-950/55 to-blue-950/96" />

        <div className="relative max-w-[1180px] w-full mx-auto px-5 pb-10 pt-8 flex flex-col justify-end gap-3.5">

          {/* Back + breadcrumb */}
          <Link
            href="/posts"
            className="inline-flex items-center gap-2 text-white/75 text-sm font-semibold hover:text-amber-300 transition-colors w-fit"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
            {t("backToPosts")}
          </Link>

          {/* Badges row */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={`text-xs font-bold tracking-wide px-3.5 py-1.5 rounded-full ${heroBadgeStyles[post.category] ?? heroBadgeStyles.Other}`}>
              {categoryLabel}
            </span>
            {!post.is_published && (
              <span className="rounded-full bg-amber-400/20 border border-amber-300/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                {t("draftPreview")}
              </span>
            )}
            {isAdmin && (
              <Link
                href={`/admin/posts/edit/${post.id}`}
                className="rounded-full bg-white/10 border border-white/20 px-3.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/20 transition-colors"
              >
                {t("editPost")}
              </Link>
            )}
          </div>

          {/* Title */}
          <h1
            className="font-title text-white leading-[1.45] m-0 max-w-[22ch] text-wrap-pretty drop-shadow-lg"
            style={{ fontSize: "clamp(22px, 3.6vw, 40px)" }}
          >
            {post.title}
          </h1>

          {/* Meta row */}
          <div className="flex items-center gap-4 flex-wrap text-white/85 text-sm">
            {/* Author avatar + name */}
            <span className="inline-flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center font-khmer-serif font-bold text-white text-sm flex-none">
                {authorInitial}
              </span>
              <span className="font-semibold">{author}</span>
            </span>

            <span className="text-white/30">·</span>

            {/* Date */}
            <span className="inline-flex items-center gap-1.5 text-white/70">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {publishedDate}
            </span>

            <span className="text-white/30">·</span>

            {/* Reading time */}
            <span className="inline-flex items-center gap-1.5 text-white/70">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5V6a2 2 0 012-2h12v16H6.5a2.5 2.5 0 010-5H18"/>
              </svg>
              អានរយៈពេល {readingTime} នាទី
            </span>

            {/* Views */}
            <span className="text-white/30">·</span>
            <span className="inline-flex items-center gap-1.5 text-white/60">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {(post.views ?? 0).toLocaleString()}
            </span>
          </div>
        </div>
      </section>

      {/* ── Content grid ── */}
      <div className="max-w-[1180px] mx-auto px-5 py-10 pb-16 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_308px] lg:gap-12 items-start">

        {/* ── Article column ── */}
        <div className="min-w-0">

          {/* Lead / excerpt */}
          {post.excerpt && (
            <div className="flex gap-4 mb-8">
              <span className="w-1 bg-accent rounded-full flex-none" />
              <p className="m-0 text-slate-700 font-medium text-xl leading-[1.85] font-khmer-serif">
                {post.excerpt}
              </p>
            </div>
          )}

          {/* Markdown body */}
          <div className="prose-content font-sans khmer">
            <Markdown content={post.content ?? ""} />
          </div>

          {/* Multi-image gallery */}
          {coverUrls.length > 1 && (
            <div className="mt-10">
              <ImageGallery urls={coverUrls} alt={post.title} pageUrl={`${SITE_URL}/posts/${slug}`} postTitle={post.title} />
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-divider">
            <span className={`text-sm px-3.5 py-1.5 rounded-full border cursor-default ${categoryBadgeStyles[post.category] ?? categoryBadgeStyles.Other}`}>
              #{categoryLabel}
            </span>
            {postTags.map((tag) => (
              <span
                key={tag}
                className="text-sm text-slate-600 bg-paper border border-divider px-3.5 py-1.5 rounded-full hover:border-brand hover:text-brand transition-colors cursor-default"
              >
                #{tag}
              </span>
            ))}
            <span className="text-sm text-slate-600 bg-paper border border-divider px-3.5 py-1.5 rounded-full">#PTEC</span>
          </div>

          {/* Engagement bar */}
          <EngagementBar
            postId={post.id}
            viewCount={post.views ?? 0}
            initialLikeCount={(post as any).like_count ?? 0}
            initialSaveCount={(post as any).save_count ?? 0}
            initialLiked={initialLiked}
            initialSaved={initialSaved}
          />

          {/* Author card */}
          <div className="flex gap-4 items-start mt-10 bg-bg-surface border border-divider rounded-2xl p-6 shadow-sm">
            <span className="w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center font-khmer-serif font-bold text-2xl flex-none shadow-sm">
              {authorInitial}
            </span>
            <div>
              <div className="text-text-muted text-[11px] tracking-widest uppercase mb-1 font-sans">សរសេរដោយ</div>
              <div className="text-text-heading font-bold text-lg font-khmer-serif">{author}</div>
              <p className="m-0 mt-2 text-sm leading-relaxed text-text-body font-sans">
                បុគ្គលិករបស់បណ្ណាល័យ វ.គ.ភ. — Phnom Penh Teacher Education College
              </p>
            </div>
          </div>

          {/* Comments */}
          <CommentsSection
            postId={post.id}
            postSlug={slug}
            initialComments={initialComments}
            commentCount={(post as any).comment_count ?? 0}
            currentUserId={user?.id ?? null}
            isAdmin={isAdmin}
          />
        </div>

        {/* ── Sidebar ── */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-[90px]">

          {/* Quick facts */}
          <div className="bg-bg-surface border border-divider rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
              <span className="w-1 h-5 bg-accent rounded-full" />
              <h3 className="font-khmer-serif font-bold text-text-heading text-base m-0">ព័ត៌មានសង្ខេប</h3>
            </div>
            <div className="px-5 pb-4 flex flex-col gap-0">
              {[
                {
                  label: "ថ្ងៃផ្សាយ",
                  value: publishedDate,
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  ),
                },
                {
                  label: "ប្រភេទ",
                  value: categoryLabel,
                  valueClass: "text-brand",
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 7h16M4 12h16M4 17h7"/>
                    </svg>
                  ),
                },
                {
                  label: "រយៈពេលអាន",
                  value: `${readingTime} នាទី`,
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                    </svg>
                  ),
                },
                {
                  label: "អ្នកអាន",
                  value: `${(post.views ?? 0).toLocaleString()} ដង`,
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  ),
                },
              ].map((row, i, arr) => (
                <div key={row.label} className={`flex items-center justify-between py-2.5 text-sm ${i < arr.length - 1 ? "border-b border-divider" : ""}`}>
                  <span className="flex items-center gap-2 text-text-muted">
                    <span className="text-text-muted">{row.icon}</span>
                    {row.label}
                  </span>
                  <span className={`font-semibold text-text-heading ${row.valueClass ?? ""}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Table of contents — active-scroll, client component */}
          <TableOfContents toc={toc} />

          {/* Share section */}
          <ShareSection postTitle={post.title} />
        </aside>
      </div>

      {/* ── Related posts ── */}
      <RelatedPosts posts={relatedPosts ?? []} category={post.category} />
    </article>
  );
}
