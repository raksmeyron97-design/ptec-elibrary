/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import Image from "next/image";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { useTranslations } from 'next-intl';

export type LatestPost = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string | null;
  coverUrl: string | null;
  author: string;
  createdAt: string | null;
  views: number;
};

type Props = { posts: LatestPost[] };

/* ── helpers ──────────────────────────────────────────────────────────── */
function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function timeAgo(iso: string | null, t: any): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 7) return t('daysAgo', { days });
  if (days < 30) return t('weeksAgo', { weeks: Math.floor(days / 7) });
  return formatDate(iso);
}

const categoryStyles: Record<string, { bg: string; text: string; dot: string }> = {
  Research:     { bg: "bg-brand/5",   text: "text-brand",                          dot: "bg-brand" },
  Announcement: { bg: "bg-gold-50",   text: "text-gold-700 dark:text-accent-text", dot: "bg-accent" },
  Event:        { bg: "bg-brand/5",   text: "text-brand",                          dot: "bg-brand" },
  Journal:      { bg: "bg-gold-50",   text: "text-gold-700 dark:text-accent-text", dot: "bg-accent" },
  Other:        { bg: "bg-paper",     text: "text-text-muted",                     dot: "bg-divider" },
};

const bannerColors = [
  "from-blue-700 to-blue-950",
  "from-blue-900 to-blue-950",
  "from-gold-700 to-gold-500",
  "from-blue-800 to-blue-700",
  "from-blue-950 to-blue-800",
];
function pickBanner(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  return bannerColors[Math.abs(hash) % bannerColors.length];
}

function CategoryBadge({ category, tPosts }: { category: string; tPosts: any }) {
  const s = categoryStyles[category] ?? categoryStyles.Other;
  const translated = category === "Research" ? tPosts("categoryResearch")
    : category === "Announcement" ? tPosts("categoryAnnouncement")
    : category === "Event" ? tPosts("categoryEvent")
    : category === "Journal" ? tPosts("categoryJournal")
    : tPosts("categoryOther");

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-bg-surface/95 px-3 py-1.5 text-[11px] font-bold ${s.text} shadow-sm backdrop-blur-md`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {translated}
    </span>
  );
}

function MetaRow({ createdAt, t }: { createdAt: string | null; t: any }) {
  return (
    <div className="flex items-center gap-3 text-[12px] font-medium text-text-muted">
      <span className="flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        {formatDate(createdAt)}
      </span>
      <span className="text-divider">•</span>
      <span>{timeAgo(createdAt, t)}</span>
    </div>
  );
}

function AuthorChip({ author }: { author: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand to-blue-700 text-[11px] font-bold text-white shadow-sm">
        {author.charAt(0).toUpperCase()}
      </div>
      <span className="max-w-[160px] truncate text-[13px] font-semibold text-text-heading">{author}</span>
    </div>
  );
}

/* ── Featured card — horizontal on desktop ────────────────────────────── */
function FeaturedCard({ post, t, tPosts }: { post: LatestPost; t: any; tPosts: any }) {
  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-xl hover:shadow-brand/5 lg:flex-row"
    >
      {/* Animated top bar on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 rounded-t-2xl bg-gradient-to-r from-brand via-accent to-brand transition-transform duration-500 group-hover:scale-x-100"
      />

      {/* Image — full width mobile, left panel desktop */}
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden lg:aspect-auto lg:min-h-[300px] lg:w-[46%]">
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt={post.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${pickBanner(post.title)} p-8`}>
            <span className="line-clamp-3 text-center font-khmer-serif text-2xl font-bold leading-snug text-white/90">{post.title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-black/10" />
        <div className="absolute left-4 top-4 z-10">
          <CategoryBadge category={post.category} tPosts={tPosts} />
        </div>
      </div>

      {/* Text panel */}
      <div className="flex flex-1 flex-col p-6 sm:p-7 lg:p-9 lg:pl-10">
        <MetaRow createdAt={post.createdAt} t={t} />
        <h3 className="mb-3 mt-3 font-serif text-xl font-bold leading-snug text-text-heading transition-colors group-hover:text-brand sm:text-2xl lg:text-[1.65rem]">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="line-clamp-3 text-[14px] leading-relaxed text-text-muted sm:text-[15px]">
            {post.excerpt}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between border-t border-divider/50 pt-5">
          <AuthorChip author={post.author} />
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-brand/8 px-3.5 py-2 text-[13px] font-semibold text-brand transition-all duration-200 group-hover:bg-brand group-hover:text-white">
            {t('readMore')}
            <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ── Small card — stacked in 3-col grid below featured ───────────────── */
function SmallCard({ post, tPosts }: { post: LatestPost; tPosts: any }) {
  const s = categoryStyles[post.category] ?? categoryStyles.Other;
  const translated = post.category === "Research" ? tPosts("categoryResearch")
    : post.category === "Announcement" ? tPosts("categoryAnnouncement")
    : post.category === "Event" ? tPosts("categoryEvent")
    : post.category === "Journal" ? tPosts("categoryJournal")
    : tPosts("categoryOther");

  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-md"
    >
      {/* Image */}
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        {post.coverUrl ? (
          <Image src={post.coverUrl} alt={post.title} fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${pickBanner(post.title)} p-4`}>
            <span className="line-clamp-2 text-center font-khmer-serif text-sm font-bold text-white/90">{post.title}</span>
          </div>
        )}
      </div>
      {/* Text */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <span className={`mb-2 inline-flex w-fit items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${s.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {translated}
        </span>
        <h4 className="line-clamp-2 font-serif text-[15px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand sm:text-[16px]">
          {post.title}
        </h4>
        <p className="mt-auto pt-3 text-[11px] font-medium text-text-muted">
          {formatDate(post.createdAt)}
        </p>
      </div>
    </Link>
  );
}

/* ── Section ──────────────────────────────────────────────────────────── */
export default function LatestPosts({ posts }: Props) {
  const t = useTranslations('home');
  const tPosts = useTranslations('posts');

  if (!posts || posts.length === 0) return null;

  const [featured, ...rest] = posts;
  const smallCards = rest.slice(0, 3);

  return (
    <section className="border-t border-divider/60 bg-paper py-10 sm:py-14 md:py-20">
      <div className="mx-auto max-w-[1400px] px-4 md:px-12">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-brand to-accent" aria-hidden />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">{t('stayUpdated')}</span>
            </div>
            <SectionTitle as="h2" className="!mb-2 mt-1">{t('latestInsights')}</SectionTitle>
            <p className="max-w-lg text-[14px] leading-relaxed text-text-muted sm:text-[15px]">
              {t('discoverLatest')}
            </p>
          </div>
          <Link
            href="/posts"
            className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-gold-700 sm:inline-flex"
          >
            {t('viewAllPosts')}
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* Featured card — full width, horizontal on desktop */}
        <FeaturedCard post={featured} t={t} tPosts={tPosts} />

        {/* 3-column small cards below */}
        {smallCards.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
            {smallCards.map((post) => (
              <SmallCard key={post.id} post={post} tPosts={tPosts} />
            ))}
          </div>
        )}

        {/* View all — mobile only (desktop version is in the header row) */}
        <div className="mt-10 text-center sm:hidden">
          <Link
            href="/posts"
            className="inline-flex items-center gap-2 rounded-full border border-divider/60 bg-bg-surface px-6 py-2.5 text-sm font-semibold text-text-heading shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand/5 hover:text-brand hover:shadow-md"
          >
            {t('viewAllPosts')}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
