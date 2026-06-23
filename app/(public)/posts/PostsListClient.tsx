"use client"
 
;
/* eslint-disable @typescript-eslint/no-explicit-any */


// app/posts/PostsListClient.tsx
import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from 'next-intl';

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

const categoryStyles: Record<string, string> = {
  Research:     "bg-brand/5 text-brand border border-divider",
  Announcement: "bg-amber-50 text-amber-700 border border-amber-100",
  Event:        "bg-orange-50 text-orange-700 border border-orange-100",
  Journal:      "bg-teal-50 text-teal-700 border border-teal-100",
  Other:        "bg-paper text-text-muted border border-divider",
};

// Deterministic color banner for posts without a cover (mirrors books' cover_color idea)
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
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return bannerColors[Math.abs(hash) % bannerColors.length];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PostsListClient({ posts }: { posts: PostCard[] }) {
  const t = useTranslations('posts');
  const [query, setQuery]         = useState("");
  const [activeCat, setActiveCat] = useState<(typeof FILTERS)[number]>("All");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return posts.filter((p) => {
      const matchesCat = activeCat === "All" || p.category === activeCat;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.excerpt ?? "").toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
      );
    });
  }, [posts, query, activeCat]);

  return (
    <div className="space-y-6">

      {/* ── Search ── */}
      <div className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-sm focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-focus-ring/50 transition-all">
        <svg className="h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="flex-1 bg-transparent text-sm text-text-body placeholder-text-muted outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="text-text-muted hover:text-text-body transition-colors">
            ✕
          </button>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((c) => (
          <button key={c} type="button" onClick={() => setActiveCat(c)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
              activeCat === c
                ? "bg-brand text-brand-contrast shadow-sm"
                : "border border-divider bg-bg-surface text-text-body hover:border-brand/40 hover:bg-paper hover:text-brand"
            }`}
          >
            {t(`category${c}` as any)}
          </button>
        ))}
      </div>

      {/* ── Grid / empty state ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface py-20 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-paper">
            <svg className="h-8 w-8 text-text-muted" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h3 className="font-khmer-serif font-bold text-lg text-text-heading">{t('noPostsFound')}</h3>
          <p className="mt-1 max-w-sm font-sans text-sm text-text-muted">
            {query || activeCat !== "All"
              ? t('emptyHintSearch')
              : t('emptyHintEmpty')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <Link
              key={post.id}
              href={`/posts/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-md"
            >
              {/* Cover */}
              <div className="relative h-48 w-full overflow-hidden">
                {post.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.coverUrl}
                    alt={post.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${pickBanner(post.title)} p-6`}>
                    <span className="line-clamp-3 text-center font-khmer-serif font-bold text-lg leading-[1.4] text-white/90">
                      {post.title}
                    </span>
                  </div>
                )}
                
                {/* Time ago */}
                <div className="absolute right-3 top-3">
                  <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                    {formatDate(post.createdAt)}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${categoryStyles[post.category] ?? categoryStyles.Other}`}>
                    {t(`category${post.category}` as any)}
                  </span>
                </div>
                <h3 className="mb-2 line-clamp-2 font-khmer-serif font-bold text-[15px] leading-[1.6] text-text-heading transition group-hover:text-brand">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="mb-4 line-clamp-2 font-sans text-[13px] leading-[1.7] text-text-muted">
                    {post.excerpt}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between border-t border-divider pt-3 text-[12px]">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/5 text-[10px] font-bold text-brand">
                      {post.author.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate font-medium text-text-body max-w-[120px]">{post.author}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}