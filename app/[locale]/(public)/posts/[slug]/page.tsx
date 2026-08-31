import { Link } from "@/i18n/navigation";
import { decodeSlugParam } from "@/lib/slug";
import NextLink from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import { organizationNode } from "@/lib/seo/org-nodes";
import { breadcrumbSchema } from "@/lib/seo/schema";
import Markdown, { extractToc, computeReadingTime } from "./Markdown";
import ViewTracker from "./ViewTracker";
import ReadingProgress from "./ReadingProgress";
import EngagementBar from "./EngagementBar";
import ShareSection from "./ShareSection";
import ImageGallery from "./ImageGallery";
import RelatedPosts from "./RelatedPosts";
import CommentsSection from "./CommentsSection";
import TableOfContents from "./TableOfContents";
import PostEventPanel from "@/components/ui/posts/PostEventPanel";
import { eventColumnsAvailable } from "@/lib/posts-data";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { openGraphBase } from "@/lib/seo/open-graph";
import { postEventJsonLd, POSTS_FALLBACK_OG_IMAGE } from "@/lib/seo/posts-seo";
import type { EventFields } from "@/lib/posts/event-status";
import { formatPtecDate, formatDateParts } from "@/lib/posts/event-status";
import DateBlock from "@/components/ui/posts/DateBlock";
import { categoryBadge } from "@/components/ui/posts/postStyles";
import { getTranslations } from "next-intl/server";
import { getOrgIdentity } from "@/lib/system-settings/config";

// ── Row shapes ──────────────────────────────────────────────────────────────
// The detail SELECT is assembled at runtime (the event_* columns only exist
// once migration 0099 has applied), so supabase-js cannot infer the row type
// and hands back `unknown`. These interfaces are the contract that SELECT is
// written against; the single cast below is the one place types are asserted,
// which is what lets the rest of the page stay `any`-free.

interface PostAuthor {
  full_name: string | null;
  email: string | null;
  role: AppRole | null;
}

interface PostRow {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  excerpt: string | null;
  cover_url: string | null;
  cover_urls: string[] | null;
  category: string;
  tags: string[] | null;
  is_published: boolean;
  views: number | null;
  like_count: number | null;
  save_count: number | null;
  comment_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  event_location?: string | null;
  event_format?: EventFields["format"];
  event_registration_url?: string | null;
  event_registration_deadline?: string | null;
  event_status_override?: EventFields["statusOverride"];
  author: PostAuthor | null;
}

interface MetadataPostRow {
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  author: Pick<PostAuthor, "full_name" | "email"> | null;
}

// The hero badge sits on a photo at 12px bold, so it needs the AA small-text
// ratio (4.5:1) against white. The -500 shades these used were all well under
// it — blue 3.68, orange 2.89, teal 2.49, amber 2.15 — and axe only ever
// flagged whichever one the post being scanned happened to use. The -700
// shades clear it (5.0–6.7:1) with the same hue.
const heroBadgeStyles: Record<string, string> = {
  Research:     "bg-blue-700 text-white",
  Announcement: "bg-amber-700 text-white",
  Event:        "bg-orange-700 text-white",
  Journal:      "bg-teal-700 text-white",
  Other:        "bg-black/55 text-white",
};

function authorName(
  author: Pick<PostAuthor, "full_name" | "email"> | null,
  fallback: string,
): string {
  return author?.full_name ?? author?.email ?? fallback;
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** Breadcrumb trails read better truncated than wrapped onto three lines. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const [t, org] = await Promise.all([
    getTranslations({ locale, namespace: "posts" }),
    getOrgIdentity(),
  ]);

  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("title, excerpt, cover_url, created_at, updated_at, author:profiles!author_id(full_name, email)")
    .eq("slug", slug)
    .single();
  const post = data as MetadataPostRow | null;

  if (!post) return { title: t("notFoundTitle") };

  const desc = post.excerpt
    ? post.excerpt.length > 157
      ? `${post.excerpt.substring(0, 157)}...`
      : post.excerpt
    : t("detailMetaFallback");

  const alternates = localeAlternates(`/posts/${slug}`, locale);
  const canonicalUrl = alternates.canonical;
  const cover = post.cover_url ?? POSTS_FALLBACK_OG_IMAGE;

  return {
    title: post.title,
    description: desc,
    alternates,
    openGraph: {
      ...(await openGraphBase(locale)),
      title: post.title,
      description: desc,
      type: "article",
      url: canonicalUrl,
      siteName: org.libraryName,
      locale: locale === "km" ? "km_KH" : "en_US",
      publishedTime: post.created_at ?? undefined,
      modifiedTime: post.updated_at ?? post.created_at ?? undefined,
      authors: [authorName(post.author, org.libraryName)],
      // Facebook is how most of this audience shares links, and it needs an
      // explicitly sized image or it picks whatever it finds on the page.
      images: [{ url: cover, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: desc,
      images: [cover],
    },
  };
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const [t, tNav, org] = await Promise.all([
    getTranslations({ locale, namespace: "posts" }),
    getTranslations({ locale, namespace: "nav" }),
    getOrgIdentity(),
  ]);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    isAdmin = ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);
  }

  // Event columns only exist once migration 0099 is applied; selecting them
  // before that would 42703 the entire query and 404 the post. Probe first.
  // The select is typed as plain string so supabase-js skips literal-type
  // parsing of the dynamic column list.
  const withEvents = await eventColumnsAvailable();
  const detailSelect: string = `
      id, title, slug, content, excerpt, cover_url, cover_urls, category, tags,
      is_published, views, like_count, save_count, created_at, updated_at${withEvents ? `,
      event_start_at, event_end_at, event_location, event_format,
      event_registration_url, event_registration_deadline, event_status_override` : ""},
      author:profiles!author_id ( full_name, email, role )
    `;
  const { data, error: postError } = await supabase
    .from("posts")
    .select(detailSelect)
    .eq("slug", slug)
    .single();
  // The one asserted boundary — see the PostRow contract at the top of the file.
  const post = data as PostRow | null;

  if (postError) {
    console.error("[PostDetailPage] Supabase error for slug=%s:", slug, postError.message, postError.code);
  }
  if (!post || (!post.is_published && !isAdmin)) notFound();

  const author = authorName(post.author, org.libraryName);
  const authorInitial = getInitial(author);
  const role: AppRole = post.author?.role ?? "staff";

  // The author's byline used to be assembled from a hardcoded Khmer role map
  // and org.libraryNameKm, so English readers were served Khmer here. Both the
  // role and the sentence frame now come from the message catalogue.
  const authorTitle = t("authorBio", {
    role: t(`authorRole.${role}` as never),
    library: locale === "km" ? org.libraryNameKm : org.libraryName,
    institution: org.institutionName,
  });

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

  const postTags: string[] = post.tags ?? [];

  const coverUrls: string[] =
    post.cover_urls && post.cover_urls.length > 0
      ? post.cover_urls
      : post.cover_url
        ? [post.cover_url]
        : [];

  const coverUrl = coverUrls[0] ?? null;

  const eventFields: EventFields | null =
    post.category === "Event" && post.event_start_at
      ? {
          startAt: post.event_start_at ?? null,
          endAt: post.event_end_at ?? null,
          location: post.event_location ?? null,
          format: post.event_format ?? null,
          registrationUrl: post.event_registration_url ?? null,
          registrationDeadline: post.event_registration_deadline ?? null,
          statusOverride: post.event_status_override ?? null,
        }
      : null;

  const categoryLabel = t(`category${post.category}` as never);
  const readingTime = computeReadingTime(post.content ?? "");
  const toc = extractToc(post.content ?? "");
  // Formatted for the reader's locale in the library's timezone. This used to
  // be pinned to "km-KH" for everyone, so English pages carried Khmer dates.
  const publishedDate = formatPtecDate(post.created_at, locale);
  const dateParts = formatDateParts(post.created_at, locale);
  const viewCount = post.views ?? 0;
  const categoryHref = `/posts?category=${encodeURIComponent(post.category)}`;

  const { data: relatedRows } = await supabase
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

  // PostgREST types embedded joins as arrays even when the relationship is
  // to-one; the runtime value here is a single author object (or null).
  type CommentRow = Omit<NonNullable<typeof rawComments>[number], "author"> & {
    author: { full_name: string | null; email: string | null } | null;
  };
  const initialComments = (rawComments ?? []) as unknown as CommentRow[];

  // NewsArticle rather than the generic Article: these are dated, datelined
  // items from an institution's newsroom, which is what the type describes and
  // what Google's Top stories / article rich results look for.
  const postSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: post.excerpt || undefined,
    url: `${SITE_URL}/posts/${slug}`,
    image: coverUrls.length > 0 ? coverUrls : [POSTS_FALLBACK_OG_IMAGE],
    datePublished: post.created_at || undefined,
    dateModified: post.updated_at || post.created_at || undefined,
    inLanguage: locale,
    isAccessibleForFree: true,
    articleSection: categoryLabel,
    keywords: postTags.length > 0 ? postTags.join(", ") : undefined,
    wordCount: (post.content ?? "").trim().split(/\s+/).filter(Boolean).length || undefined,
    author: { "@type": "Person", name: author },
    // The institution, by reference. This was a fourth hand-rolled
    // EducationalOrganization node — and like the others it set `url` to the
    // LIBRARY origin, contradicting the site graph's real institution url on
    // the same page (docs/SEO-V3-AUDIT.md D-2). The logo is kept: it is the
    // publisher image Article consumers look for.
    publisher: {
      ...organizationNode(org),
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/posts/${slug}`,
    },
  };

  // Breadcrumb labels are the reader's, not hardcoded English — the trail is
  // rendered visibly below and mirrored into BreadcrumbList structured data.
  const postBreadcrumbSchema = breadcrumbSchema([
    { name: tNav("home"), path: "/" },
    { name: t("title"), path: "/posts" },
    { name: post.title },
  ], { locale });

  // An Event-category post is described by schema.org/Event; everything else
  // stays a schema.org/Article. Only one primary node is emitted.
  const eventSchema = eventFields
    ? postEventJsonLd({
        org: await getOrgIdentity(),
        event: eventFields,
        title: post.title,
        description: post.excerpt,
        url: `${SITE_URL}/posts/${slug}`,
        image: coverUrl,
      })
    : null;

  return (
    <article className="min-h-screen bg-bg-app">
      <JsonLd data={eventSchema ?? postSchema} />
      <JsonLd data={postBreadcrumbSchema} />
      <ViewTracker postId={post.id} />
      <ReadingProgress />

      {/* ── Hero ── */}
      <section
        className="relative flex bg-blue-950 pt-[72px]"
        style={{ minHeight: "clamp(360px, 50vh, 540px)" }}
      >
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={post.title}
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          /* No cover: a branded plate rather than a bare navy void. The mark is
             decorative here — the post title sits right below it in the <h1>. */
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <Image
              src="/logo.png"
              alt=""
              width={168}
              height={168}
              priority
              className="h-24 w-24 opacity-[0.14] sm:h-32 sm:w-32"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 via-blue-950/55 to-blue-950/96" />

        <div className="relative max-w-[1180px] w-full mx-auto px-5 pb-10 pt-8 flex flex-col justify-end gap-3.5">

          {/* Breadcrumb (mirrors the BreadcrumbList JSON-LD above) */}
          <nav aria-label={t("detailBreadcrumbAria")} className="flex flex-wrap items-center gap-2 text-sm text-white/65">
            <Link href="/" className="transition-colors hover:text-amber-300">
              {tNav("home")}
            </Link>
            <span aria-hidden="true" className="opacity-50">›</span>
            <Link href="/posts" className="transition-colors hover:text-amber-300">
              {t("title")}
            </Link>
            <span aria-hidden="true" className="opacity-50">›</span>
            <span className="font-semibold text-white/90" aria-current="page">
              {truncate(post.title, 40)}
            </span>
          </nav>

          {/* Back to listing */}
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
            <Link
              href={categoryHref}
              aria-label={t("browseCategory", { category: categoryLabel })}
              className={`text-xs font-bold tracking-wide px-3.5 py-1.5 rounded-full no-underline transition-opacity hover:opacity-85 ${heroBadgeStyles[post.category] ?? heroBadgeStyles.Other}`}
            >
              {categoryLabel}
            </Link>
            {!post.is_published && (
              <span className="rounded-full bg-amber-400/20 border border-amber-300/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                {t("draftPreview")}
              </span>
            )}
            {isAdmin && (
              <NextLink
                href={`/admin/posts/edit/${post.id}`}
                className="rounded-full bg-white/10 border border-white/20 px-3.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/20 transition-colors"
              >
                {t("editPost")}
              </NextLink>
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
              {t("minRead", { minutes: readingTime })}
            </span>

            {/* Views */}
            <span className="text-white/30">·</span>
            <span className="inline-flex items-center gap-1.5 text-white/60">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {t("viewCount", { count: viewCount })}
            </span>
          </div>
        </div>
      </section>

      {/* ── Content grid ── */}
      <div className="max-w-[1180px] mx-auto px-5 py-10 pb-16 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_308px] lg:gap-12 items-start">

        {/* ── Article column ── */}
        <div className="min-w-0">

          {/* Dateline + lead.
              The date block that leads every card on the listing reappears
              here, so an item carries the same mark in the index and in the
              record itself. The rule under the day is the page's one repeated
              ornament. */}
          <div className="mb-8 flex gap-5 border-b border-divider pb-7">
            {dateParts && <DateBlock parts={dateParts} />}
            {post.excerpt ? (
              <p className="m-0 font-khmer-serif text-[19px] font-medium leading-[1.8] text-text-body">
                {post.excerpt}
              </p>
            ) : (
              <p className="m-0 self-center font-sans text-sm text-text-muted">
                {author}
              </p>
            )}
          </div>

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
            <Link
              href={categoryHref}
              aria-label={t("browseCategory", { category: categoryLabel })}
              className={`text-sm px-3.5 py-1.5 rounded-full no-underline transition-opacity hover:opacity-80 ${categoryBadge(post.category)}`}
            >
              #{categoryLabel}
            </Link>
            {postTags.map((tag) => (
              <span
                key={tag}
                className="text-sm text-text-body bg-paper border border-divider px-3.5 py-1.5 rounded-full hover:border-brand hover:text-brand transition-colors cursor-default"
              >
                #{tag}
              </span>
            ))}
            <span className="text-sm text-text-body bg-paper border border-divider px-3.5 py-1.5 rounded-full">#PTEC</span>
          </div>

          {/* Engagement bar */}
          <EngagementBar
            postId={post.id}
            viewCount={viewCount}
            initialLikeCount={post.like_count ?? 0}
            initialSaveCount={post.save_count ?? 0}
            initialLiked={initialLiked}
            initialSaved={initialSaved}
          />

          {/* Author card */}
          <div className="flex gap-4 items-start mt-10 bg-bg-surface border border-divider rounded-2xl p-6 shadow-sm">
            <span className="w-14 h-14 rounded-full bg-brand text-brand-contrast flex items-center justify-center font-khmer-serif font-bold text-2xl flex-none shadow-sm">
              {authorInitial}
            </span>
            <div>
              <div className="text-text-muted text-[11px] tracking-widest uppercase mb-1 font-sans">{t("writtenBy")}</div>
              <div className="text-text-heading font-bold text-lg font-khmer-serif">{author}</div>
              <p className="m-0 mt-2 text-sm leading-relaxed text-text-body font-sans">
                {authorTitle}
              </p>
            </div>
          </div>

          {/* Comments */}
          <CommentsSection
            postId={post.id}
            postSlug={slug}
            initialComments={initialComments}
            commentCount={post.comment_count ?? 0}
            currentUserId={user?.id ?? null}
            isAdmin={isAdmin}
          />
        </div>

        {/* ── Sidebar ── */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-[90px]">

          {/* Event details (Event-category posts only) */}
          {eventFields && <PostEventPanel event={eventFields} title={post.title} />}

          {/* The "Quick facts" card stood here. Every one of its four rows —
              published date, category, reading time, view count — is already
              in the hero meta row directly above the article, so it restated
              the page back to the reader in a second visual style. Cut, and
              the sidebar drops from four near-identical boxes to two with
              real jobs: what the event is, and where you are in the text. */}

          {/* Table of contents — active-scroll, client component */}
          <TableOfContents toc={toc} />

          {/* Share section */}
          <ShareSection postTitle={post.title} />
        </aside>
      </div>

      {/* ── Related posts ── */}
      <RelatedPosts posts={relatedRows ?? []} locale={locale} />

      {/* ── Back to the listing (the hero link is above the fold; a reader who
             has read to the end should not have to scroll back up for it) ── */}
      <div className="border-t border-divider bg-bg-app">
        <div className="mx-auto max-w-[1180px] px-5 py-8">
          <Link
            href="/posts"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand no-underline transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app rounded-md"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
            {t("backToPosts")}
          </Link>
        </div>
      </div>
    </article>
  );
}
