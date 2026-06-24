"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useMemo } from "react";
import Link from "next/link";
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
const PER_PAGE = 5;

const CAT_COLORS: Record<string, { bg: string; text: string; badgeBg: string; badgeText: string }> = {
  Research:     { bg: "#1e40af", text: "#bfdbfe", badgeBg: "#dbeafe", badgeText: "#1d4ed8" },
  Announcement: { bg: "#92400e", text: "#fde68a", badgeBg: "#fef3c7", badgeText: "#b45309" },
  Event:        { bg: "#065f46", text: "#a7f3d0", badgeBg: "#d1fae5", badgeText: "#047857" },
  Journal:      { bg: "#4c1d95", text: "#ddd6fe", badgeBg: "#ede9fe", badgeText: "#6d28d9" },
  Other:        { bg: "#1e3a5f", text: "#bfdbfe", badgeBg: "#e0f2fe", badgeText: "#0369a1" },
};

function getCat(cat: string) {
  return CAT_COLORS[cat] ?? CAT_COLORS.Other;
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
    <div className="mx-auto max-w-[1180px] px-5 py-10 pb-16 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 items-start">

      {/* ── Main feed ── */}
      <div className="min-w-0">

        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-divider pb-5">
          {FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCatChange(cat)}
              className="text-sm font-semibold px-[18px] py-2 rounded-full cursor-pointer transition-colors border"
              style={{
                background:   cat === activeCat ? "#1d4ed8" : undefined,
                color:        cat === activeCat ? "#fff" : undefined,
                borderColor:  cat === activeCat ? "#1d4ed8" : undefined,
              }}
            >
              {t(`category${cat}` as any)}
            </button>
          ))}
        </div>

        {/* Featured post */}
        {featured && (
          <Link
            href={`/posts/${featured.slug}`}
            className="group block no-underline relative rounded-2xl overflow-hidden shadow-md mb-8 bg-[#0b1530]"
          >
            <div className="aspect-[16/8] overflow-hidden">
              {featured.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featured.coverUrl}
                  alt={featured.title}
                  className="w-full h-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.04]"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center p-8"
                  style={{ background: getCat(featured.category).bg }}
                >
                  <span
                    className="font-khmer-serif font-bold text-3xl text-center leading-snug"
                    style={{ color: getCat(featured.category).text }}
                  >
                    {featured.title}
                  </span>
                </div>
              )}
            </div>
            {/* Gradient overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(180deg,rgba(11,21,48,0) 30%,rgba(11,21,48,.55) 60%,rgba(11,21,48,.92) 100%)" }}
            />
            <div className="absolute left-0 right-0 bottom-0 p-8">
              <span
                className="inline-flex items-center gap-[7px] text-xs font-bold tracking-[.04em] px-3 py-[5px] rounded-full mb-3"
                style={{ background: "#f59e0b", color: "#0b1530" }}
              >
                ★ {t('featuredBadge')}
              </span>
              <h2 className="font-khmer-serif font-bold text-white text-[clamp(22px,3vw,30px)] leading-snug m-0 mb-3 transition-colors group-hover:text-amber-200">
                {featured.title}
              </h2>
              <div className="flex items-center gap-4 text-blue-100 text-sm">
                <span className="inline-flex items-center gap-[6px]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                  </svg>
                  {formatDate(featured.createdAt, locale)}
                </span>
                <span className="text-amber-300">{t(`category${featured.category}` as any)}</span>
              </div>
            </div>
          </Link>
        )}

        {/* Post list / empty state */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface py-20 text-center shadow-sm">
            <h3 className="font-khmer-serif font-bold text-lg text-text-heading">{t('noPostsFound')}</h3>
            <p className="mt-1 max-w-sm text-sm text-text-muted">
              {query || activeCat !== "All" ? t('emptyHintSearch') : t('emptyHintEmpty')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {pagePosts.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.slug}`}
                className="group grid grid-cols-1 sm:grid-cols-[240px_1fr] no-underline bg-bg-surface border border-divider rounded-xl overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-[3px] hover:shadow-lg"
              >
                {/* Thumbnail */}
                <div className="relative overflow-hidden min-h-[140px] sm:min-h-0">
                  {post.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.coverUrl}
                      alt={post.title}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-[350ms] group-hover:scale-[1.05]"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center p-4"
                      style={{ background: getCat(post.category).bg }}
                    >
                      <span
                        className="font-khmer-serif font-bold text-2xl text-center"
                        style={{ color: getCat(post.category).text }}
                      >
                        {t(`category${post.category}` as any)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col p-5 pl-6">
                  <span
                    className="self-start text-xs font-bold tracking-[.03em] px-[11px] py-1 rounded-full mb-3"
                    style={{
                      background: getCat(post.category).badgeBg,
                      color:      getCat(post.category).badgeText,
                    }}
                  >
                    {t(`category${post.category}` as any)}
                  </span>
                  <h3 className="font-khmer-serif font-bold text-text-heading text-xl leading-snug m-0 mb-2 transition-colors group-hover:text-brand">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="m-0 mb-4 text-base leading-normal text-text-body font-sans line-clamp-2">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-[6px] text-text-muted text-sm">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                      </svg>
                      {formatDate(post.createdAt, locale)}
                    </span>
                    <span className="inline-flex items-center gap-[7px] text-brand text-sm font-bold transition-all group-hover:gap-3">
                      {t('readMore')}
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
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
          <div className="flex items-center justify-center gap-2 mt-10">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
              <button
                key={pg}
                onClick={() => setPage(pg)}
                className="inline-flex items-center justify-center min-w-[40px] h-10 px-3 rounded-md text-sm cursor-pointer transition-all"
                style={{
                  background:   pg === page ? "#1d4ed8" : "#fff",
                  color:        pg === page ? "#fff" : "#475569",
                  border:       pg === page ? "none" : "1px solid #cbd5e1",
                  fontWeight:   pg === page ? 700 : 600,
                }}
              >
                {pg}
              </button>
            ))}
            {page < totalPages && (
              <button
                onClick={() => setPage(p => p + 1)}
                className="inline-flex items-center gap-[6px] h-10 px-4 rounded-md bg-white border border-[#cbd5e1] text-slate-700 text-sm font-semibold transition-all hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 cursor-pointer"
              >
                {t('nextPage')}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <aside className="flex flex-col gap-6 lg:sticky lg:top-[90px]">

        {/* Search */}
        <div className="bg-bg-surface border border-divider rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 bg-paper border border-divider rounded-full px-4 py-[9px]">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-text-muted shrink-0">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('searchSidebarPlaceholder')}
              className="border-none outline-none bg-transparent font-sans text-sm text-text-heading w-full placeholder:text-text-muted"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="bg-bg-surface border border-divider rounded-xl px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-1 h-5 bg-amber-500 rounded-full shrink-0" />
            <h3 className="font-khmer-serif font-bold text-text-heading text-lg m-0">{t('categoriesTitle')}</h3>
          </div>
          {catCounts.map((c, idx) => (
            <button
              key={c.key}
              onClick={() => handleCatChange(c.key as any)}
              className={`flex items-center justify-between w-full text-left text-text-body text-base font-sans py-[9px] border-b border-divider transition-all hover:text-brand hover:pl-1 cursor-pointer bg-transparent border-x-0 border-t-0 ${idx === catCounts.length - 1 ? "border-b-0" : ""}`}
            >
              <span>{c.label}</span>
              <span className="bg-paper text-text-muted text-xs font-bold min-w-[26px] text-center py-0.5 px-2 rounded-full">
                {c.count}
              </span>
            </button>
          ))}
        </div>

        {/* Recent posts */}
        <div className="bg-bg-surface border border-divider rounded-xl px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-1 h-5 bg-amber-500 rounded-full shrink-0" />
            <h3 className="font-khmer-serif font-bold text-text-heading text-lg m-0">{t('recentTitle')}</h3>
          </div>
          <div className="flex flex-col gap-4">
            {posts.slice(0, 3).map((p) => (
              <Link
                key={p.id}
                href={`/posts/${p.slug}`}
                className="group grid grid-cols-[64px_1fr] gap-3 no-underline items-center"
              >
                <div
                  className="w-16 h-16 rounded-lg shrink-0 overflow-hidden"
                  style={p.coverUrl
                    ? { backgroundImage: `url('${p.coverUrl}')`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: getCat(p.category).bg }}
                />
                <div>
                  <div className="font-khmer-serif font-semibold text-text-heading text-sm leading-snug transition-colors group-hover:text-brand line-clamp-2">
                    {p.title}
                  </div>
                  <div className="text-text-muted text-xs mt-1">
                    {formatDate(p.createdAt, locale)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Contact CTA */}
        <div className="bg-[#0b1530] rounded-xl p-6 shadow-md">
          <h3 className="font-khmer-serif font-bold text-white text-lg m-0 mb-3">{t('contactTitle')}</h3>
          <p className="m-0 mb-4 text-sm leading-normal text-blue-200">
            {locale === "km" ? PTEC.address.km : PTEC.address.en}
          </p>
          <div className="flex flex-col gap-2 text-sm text-blue-100">
            <a href={PTEC.phoneTel} className="no-underline text-blue-100 hover:text-white transition-colors">
              📞 {PTEC.phone}
            </a>
            <a href={`mailto:${PTEC.email}`} className="no-underline text-blue-100 hover:text-white transition-colors">
              ✉ {PTEC.email}
            </a>
            <span>🕐 {locale === "km" ? PTEC.hours.km : PTEC.hours.en}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
