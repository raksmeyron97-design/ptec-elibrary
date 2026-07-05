"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations, useLocale } from 'next-intl';
import { PTEC } from "@/lib/ptec";

type PostCard = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string | null;
  coverUrl: string | null;
  author: string;
  createdAt: string | null;
};

const FILTERS = ["All", "Research", "Announcement", "Event", "Journal"] as const;
const PER_PAGE = 6;

const CAT_STYLES: Record<string, { accent: string; badge: string; badgeText: string; bg: string; text: string }> = {
  Research:     { accent: "#1d4ed8", badge: "#dbeafe", badgeText: "#1d4ed8", bg: "#1e40af", text: "#bfdbfe" },
  Announcement: { accent: "#b45309", badge: "#fef3c7", badgeText: "#b45309", bg: "#92400e", text: "#fde68a" },
  Event:        { accent: "#047857", badge: "#d1fae5", badgeText: "#047857", bg: "#065f46", text: "#a7f3d0" },
  Journal:      { accent: "#6d28d9", badge: "#ede9fe", badgeText: "#6d28d9", bg: "#4c1d95", text: "#ddd6fe" },
  Other:        { accent: "#0369a1", badge: "#e0f2fe", badgeText: "#0369a1", bg: "#1e3a5f", text: "#bae6fd" },
};

function getCat(cat: string) {
  return CAT_STYLES[cat] ?? CAT_STYLES.Other;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(locale === "km" ? "km-KH" : "en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

export default function PostsListClient({ posts }: { posts: PostCard[] }) {
  const t = useTranslations('posts');
  const locale = useLocale();
  const [query, setQuery]         = useState("");
  const [activeCat, setActiveCat] = useState<typeof FILTERS[number]>("All");
  const [page, setPage]           = useState(1);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return posts.filter((p) => {
      const matchesCat = activeCat === "All" || p.category === activeCat;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.excerpt ?? "").toLowerCase().includes(q)
      );
    });
  }, [posts, query, activeCat]);

  const featured   = filtered[0] ?? null;
  const rest       = filtered.slice(1);
  const totalPages = Math.max(1, Math.ceil(rest.length / PER_PAGE));
  const pagePosts  = rest.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const catCounts = useMemo(
    () => FILTERS.filter(f => f !== "All").map(cat => ({
      key:   cat,
      label: t(`category${cat}` as any),
      count: posts.filter(p => p.category === cat).length,
    })),
    [posts, t],
  );

  function handleCatChange(cat: typeof FILTERS[number]) {
    setActiveCat(cat);
    setPage(1);
  }

  return (
    <div className="bg-bg-app">

      {/* ── Filter strip ── */}
      <div className="bg-bg-surface border-b border-divider">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="flex overflow-x-auto gap-1 py-3" style={{ scrollbarWidth: "none" }}>
            {FILTERS.map((cat) => {
              const count = cat === "All"
                ? posts.length
                : posts.filter(p => p.category === cat).length;
              const isActive = cat === activeCat;
              // An empty category tab is a guaranteed dead end — hide it
              // (unless it is somehow the active one, so it can be left).
              if (count === 0 && !isActive) return null;
              return (
                <button
                  key={cat}
                  onClick={() => handleCatChange(cat)}
                  className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-full cursor-pointer transition-all whitespace-nowrap border"
                  style={{
                    background:  isActive ? "#1e3a8a" : "transparent",
                    color:       isActive ? "#fff" : "#475569",
                    borderColor: isActive ? "#1e3a8a" : "transparent",
                  }}
                >
                  {t(`category${cat}` as any)}
                  <span
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none"
                    style={{
                      background: isActive ? "rgba(255,255,255,0.2)" : "#f1f5f9",
                      color:      isActive ? "#fff" : "#64748b",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content + Sidebar ── */}
      <div className="mx-auto max-w-[1180px] px-5 py-8 pb-16 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10 items-start">

        {/* ── Main feed ── */}
        <div className="min-w-0">

          {/* Featured post */}
          {featured && (
            <Link
              href={`/posts/${featured.slug}`}
              className="group block no-underline relative rounded-2xl overflow-hidden shadow-md mb-7 cursor-pointer"
              style={{ background: "#0b1530" }}
            >
              <div className="overflow-hidden" style={{ aspectRatio: "16/7" }}>
                {featured.coverUrl ? (
                  <Image
                    src={featured.coverUrl}
                    alt={featured.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center p-8"
                    style={{ background: getCat(featured.category).bg }}
                  >
                    <span className="font-khmer-serif font-bold text-3xl text-center leading-snug"
                      style={{ color: getCat(featured.category).text }}>
                      {featured.title}
                    </span>
                  </div>
                )}
              </div>

              {/* Gradient overlay */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to top, rgba(11,21,48,.92) 0%, rgba(11,21,48,.45) 45%, transparent 100%)" }} />

              {/* Content */}
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <div className="flex items-center gap-2.5 mb-3">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide px-3 py-1.5 rounded-full"
                    style={{ background: "#f59e0b", color: "#0b1530" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    {t('featuredBadge')}
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-white/90">
                    {t(`category${featured.category}` as any)}
                  </span>
                </div>
                <h2 className="font-khmer-serif font-bold text-white text-[clamp(20px,2.8vw,30px)] leading-snug m-0 mb-3 transition-colors group-hover:text-amber-200 max-w-[40ch]">
                  {featured.title}
                </h2>
                <div className="flex items-center gap-3 text-blue-200/80 text-sm flex-wrap">
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                    </svg>
                    {formatDate(featured.createdAt, locale)}
                  </span>
                  <span className="text-white/30">·</span>
                  <span className="font-semibold text-white/75">{featured.author}</span>
                </div>
              </div>
            </Link>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface py-20 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-paper flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                </svg>
              </div>
              <h3 className="font-khmer-serif font-bold text-lg text-text-heading">{t('noPostsFound')}</h3>
              <p className="mt-1 max-w-xs text-sm text-text-muted">
                {query || activeCat !== "All" ? t('emptyHintSearch') : t('emptyHintEmpty')}
              </p>
            </div>
          )}

          {/* Posts grid */}
          {pagePosts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {pagePosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.slug}`}
                  className="group flex flex-col no-underline bg-bg-surface border border-divider rounded-2xl overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer"
                >
                  {/* Thumbnail */}
                  <div className="relative overflow-hidden flex-none" style={{ aspectRatio: "16/9" }}>
                    {post.coverUrl ? (
                      <Image
                        src={post.coverUrl}
                        alt={post.title}
                        fill
                        className="object-cover transition-transform duration-400 group-hover:scale-[1.06]"
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex items-center justify-center p-5"
                        style={{ background: getCat(post.category).bg }}
                      >
                        <span
                          className="font-khmer-serif font-bold text-xl text-center leading-snug line-clamp-3"
                          style={{ color: getCat(post.category).text }}
                        >
                          {post.title}
                        </span>
                      </div>
                    )}
                    {/* Category badge */}
                    <span
                      className="absolute top-3 left-3 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full shadow-sm"
                      style={{
                        background: getCat(post.category).badge,
                        color:      getCat(post.category).badgeText,
                      }}
                    >
                      {t(`category${post.category}` as any)}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex flex-col flex-1 p-5">
                    <h3 className="font-khmer-serif font-bold text-text-heading text-lg leading-snug m-0 mb-2 transition-colors group-hover:text-brand line-clamp-3">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="m-0 mb-3 text-sm leading-relaxed text-text-body line-clamp-2">
                        {post.excerpt}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t border-divider">
                      <span className="inline-flex items-center gap-1.5 text-text-muted text-xs">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                          <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                        </svg>
                        {formatDate(post.createdAt, locale)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-brand text-xs font-bold transition-all group-hover:gap-2.5">
                        {t('readMore')}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-10">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-divider bg-bg-surface text-text-muted text-sm transition hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 6l-6 6 6 6"/>
                </svg>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className="inline-flex items-center justify-center min-w-[36px] h-9 px-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
                  style={{
                    background:  pg === page ? "#1e3a8a" : "#fff",
                    color:       pg === page ? "#fff" : "#475569",
                    border:      pg === page ? "1px solid #1e3a8a" : "1px solid #e5e7eb",
                    fontWeight:  pg === page ? 700 : 500,
                  }}
                >
                  {pg}
                </button>
              ))}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-divider bg-bg-surface text-text-muted text-sm transition hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-[90px]">

          {/* Search */}
          <div className="bg-bg-surface border border-divider rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 bg-paper border border-divider rounded-lg px-3.5 py-2.5 transition-shadow focus-within:ring-2 focus-within:ring-brand/10 focus-within:border-brand/40">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-text-muted shrink-0">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
              </svg>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('searchSidebarPlaceholder')}
                className="border-none outline-none bg-transparent font-sans text-sm text-text-heading w-full placeholder:text-text-muted"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-text-muted hover:text-text-heading cursor-pointer transition-colors shrink-0"
                  aria-label="Clear search"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Categories */}
          <div className="bg-bg-surface border border-divider rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
              <span className="w-1 h-5 bg-accent rounded-full shrink-0" />
              <h3 className="font-khmer-serif font-bold text-text-heading text-base m-0">{t('categoriesTitle')}</h3>
            </div>
            <div className="px-2 pb-2">
              {catCounts.map((c) => {
                const style = getCat(c.key);
                const isActive = activeCat === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => handleCatChange(c.key as any)}
                    className="flex items-center justify-between w-full text-left rounded-lg px-3 py-2.5 text-sm font-sans transition-all cursor-pointer"
                    style={{
                      background: isActive ? style.badge : "transparent",
                      color:      isActive ? style.badgeText : "#475569",
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: style.accent }} />
                      {c.label}
                    </span>
                    <span
                      className="text-[11px] font-bold min-w-[22px] text-center py-0.5 px-1.5 rounded-full"
                      style={{
                        background: isActive ? style.accent : "#f1f5f9",
                        color:      isActive ? "#fff" : "#64748b",
                      }}
                    >
                      {c.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent posts */}
          <div className="bg-bg-surface border border-divider rounded-xl px-5 py-5 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 bg-accent rounded-full shrink-0" />
              <h3 className="font-khmer-serif font-bold text-text-heading text-base m-0">{t('recentTitle')}</h3>
            </div>
            <div className="flex flex-col gap-3.5">
              {posts.slice(0, 4).map((p) => (
                <Link
                  key={p.id}
                  href={`/posts/${p.slug}`}
                  className="group flex items-start gap-3 no-underline cursor-pointer"
                >
                  <div
                    className="w-14 h-14 rounded-lg shrink-0 flex-none overflow-hidden"
                    style={p.coverUrl
                      ? { backgroundImage: `url('${p.coverUrl}')`, backgroundSize: "cover", backgroundPosition: "center" }
                      : { background: getCat(p.category).bg }}
                  />
                  <div className="min-w-0">
                    <div className="font-khmer-serif font-semibold text-text-heading text-sm leading-snug transition-colors group-hover:text-brand line-clamp-2 mb-1">
                      {p.title}
                    </div>
                    <div className="text-text-muted text-[11px]">
                      {formatDate(p.createdAt, locale)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Contact CTA */}
          <div className="bg-[#0b1530] rounded-xl p-5 shadow-md">
            <h3 className="font-khmer-serif font-bold text-white text-base m-0 mb-3">{t('contactTitle')}</h3>
            <p className="m-0 mb-4 text-sm leading-relaxed text-blue-200/75">
              {locale === "km" ? PTEC.address.km : PTEC.address.en}
            </p>
            <div className="flex flex-col gap-2.5">
              <a href={PTEC.phoneTel} className="no-underline text-blue-200 hover:text-white transition-colors inline-flex items-center gap-2 text-sm">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.29 6.29l1.28-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
                {PTEC.phone}
              </a>
              <a href={`mailto:${PTEC.email}`} className="no-underline text-blue-200 hover:text-white transition-colors inline-flex items-center gap-2 text-sm">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                {PTEC.email}
              </a>
              <span className="text-blue-300/60 text-xs inline-flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="shrink-0">
                  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                </svg>
                {locale === "km" ? PTEC.hours.km : PTEC.hours.en}
              </span>
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}
