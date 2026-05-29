"use client";

// app/posts/PostsListClient.tsx
import { useState, useMemo } from "react";
import Link from "next/link";

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
  Research:     "bg-cyan-50 text-cyan-700",
  Announcement: "bg-violet-50 text-violet-700",
  Event:        "bg-orange-50 text-orange-700",
  Journal:      "bg-blue-50 text-blue-700",
  Other:        "bg-slate-100 text-slate-600",
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
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts…"
          className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCat(c)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              activeCat === c
                ? "bg-[#007c91] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* ── Grid / empty state ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-8 w-8 text-slate-400" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h3 className="font-title text-lg text-slate-700">No posts found</h3>
          <p className="mt-1 max-w-sm font-body text-sm text-slate-400">
            {query || activeCat !== "All"
              ? "Try adjusting your search or filters."
              : "Check back soon — new posts are on the way."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <Link
              key={post.id}
              href={`/posts/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* Cover */}
              {post.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.coverUrl}
                  alt={post.title}
                  className="h-44 w-full object-cover transition group-hover:scale-[1.02]"
                />
              ) : (
                <div className={`flex h-44 w-full items-center justify-center bg-gradient-to-br ${pickBanner(post.title)} p-5`}>
                  <span className="line-clamp-3 text-center font-title text-lg leading-snug text-white/90">
                    {post.title}
                  </span>
                </div>
              )}

              {/* Body */}
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${categoryStyles[post.category] ?? categoryStyles.Other}`}>
                    {post.category}
                  </span>
                </div>
                <h3 className="mb-2 line-clamp-2 font-title text-lg leading-snug text-slate-800 transition group-hover:text-[#007c91]">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="mb-4 line-clamp-3 font-body text-sm leading-relaxed text-slate-500">
                    {post.excerpt}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between text-xs text-slate-400">
                  <span className="truncate font-medium text-slate-500">{post.author}</span>
                  <span className="shrink-0 tabular-nums">{formatDate(post.createdAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}