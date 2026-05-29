// app/home/page.tsx
import React, { Suspense } from "react";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import BookCard from "@/components/ui/BookCard";
import SearchBar from "@/components/ui/SearchBar";
import HeroBookStack from "@/components/ui/HeroBookStack";

export const revalidate = 60;

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function getStats() {
  const supabase = createServiceClient();

  const [booksRes, downloadsRes, usersRes, viewsRes] = await Promise.all([
    supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    supabase
      .from("books")
      .select("download_count")
      .eq("is_published", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("books")
      .select("view_count")
      .eq("is_published", true),
  ]);

  const totalDownloads = (downloadsRes.data ?? []).reduce(
    (sum, b) => sum + (b.download_count ?? 0),
    0
  );
  const totalViews = (viewsRes.data ?? []).reduce(
    (sum, b) => sum + (b.view_count ?? 0),
    0
  );

  return {
    books:     booksRes.count ?? 0,
    downloads: totalDownloads,
    users:     usersRes.count ?? 0,
    views:     totalViews,
  };
}

async function getFeaturedBooks() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select(
      `id, title, slug, description, cover_color, cover_url, language,
       published_at, department, pages, isbn, rating, download_count, view_count,
       authors(name), categories(name), book_files(format, file_url, file_size_kb)`
    )
    .eq("is_published", true)
    .order("download_count", { ascending: false })
    .limit(5);

  return (data ?? []).map(mapRowToBook);
}

async function getRecentPosts() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("posts")
    .select(
      `id, title, slug, category, excerpt, cover_url, created_at, views,
       author:profiles(full_name, email)`
    )
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(3);

  return (data ?? []).map((p: any) => ({
    id:        p.id        as string,
    title:     p.title     as string,
    slug:      p.slug      as string,
    category:  (p.category  ?? "Other")         as string,
    excerpt:   (p.excerpt   ?? null)             as string | null,
    coverUrl:  (p.cover_url ?? null)             as string | null,
    author:    (p.author?.full_name ?? p.author?.email ?? "PTEC Library") as string,
    createdAt: (p.created_at ?? null)            as string | null,
    views:     (p.views ?? 0)                    as number,
  }));
}

async function getDepartmentPills(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select("department")
    .eq("is_published", true)
    .not("department", "is", null)
    .order("department", { ascending: true });

  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (row.department) seen.add(row.department);
  }
  return [...seen].slice(0, 6);
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(iso);
}

// ── Category badge colours ────────────────────────────────────────────────────

const categoryStyles: Record<string, { bg: string; text: string; dot: string }> = {
  Research:     { bg: "bg-cyan-50",    text: "text-cyan-700",    dot: "bg-cyan-500"    },
  Announcement: { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500"  },
  Event:        { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500"  },
  Journal:      { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500"    },
  Other:        { bg: "bg-slate-100",  text: "text-slate-600",   dot: "bg-slate-400"   },
};

const bannerColors = [
  "from-[#0f766e] to-[#064e3b]",
  "from-[#1d4ed8] to-[#1e1b4b]",
  "from-[#7c3aed] to-[#312e81]",
  "from-[#0891b2] to-[#164e63]",
  "from-[#b45309] to-[#451a03]",
];

function pickBanner(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return bannerColors[Math.abs(hash) % bannerColors.length];
}

// ── Stat icons ────────────────────────────────────────────────────────────────

const statIcons: Record<string, React.ReactNode> = {
  Resources: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  Views: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Downloads: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13m0 0-4-4m4 4 4-4" /><path d="M4 20h16" />
    </svg>
  ),
  Members: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const [stats, featuredBooks, recentPosts, deptPills] = await Promise.all([
    getStats(),
    getFeaturedBooks(),
    getRecentPosts(),
    getDepartmentPills(),
  ]);

  const statItems = [
    { label: "Resources",   value: formatStat(stats.books),     sub: "published books & materials" },
    { label: "Views",       value: formatStat(stats.views),     sub: "total resource views"        },
    { label: "Downloads",   value: formatStat(stats.downloads), sub: "total across all resources"  },
    { label: "Members",     value: formatStat(stats.users),     sub: "registered readers"          },
  ];

  return (
    <div className="min-h-screen bg-[#F5F6FA]">

      {/* ══════════════════════════════════════════════════════════════════════
          HERO
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden bg-[#0a1629]">

        {/* ── Decorative background ── */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* Gradient mesh */}
          <div className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-[#0C7C8A]/20 blur-[120px]" />
          <div className="absolute -right-20 top-20 h-[400px] w-[400px] rounded-full bg-[#7c3aed]/10 blur-[100px]" />
          <div className="absolute bottom-0 left-1/3 h-[300px] w-[500px] rounded-full bg-[#0891b2]/10 blur-[80px]" />

          {/* Dot pattern */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* Diagonal lines accent */}
          <div className="absolute -right-10 bottom-0 h-40 w-80 opacity-[0.04] rotate-12"
            style={{
              backgroundImage: "repeating-linear-gradient(90deg, #fff, #fff 2px, transparent 2px, transparent 20px)",
            }}
          />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-64px)] max-w-[1400px] items-center px-4 md:px-12">
          <div className="grid w-full items-center gap-12 py-16 lg:grid-cols-[1fr_1fr] lg:gap-16 md:py-0">

            {/* Left: Text content */}
            <div className="max-w-2xl">
              {/* Eyebrow */}
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[12px] font-semibold tracking-wide text-slate-300">
                  PTEC e-Library — Open for all educators
                </span>
              </div>

              <h1 className="font-[family-name:var(--font-angkor)] text-[clamp(32px,5vw,56px)] leading-[1.1] tracking-tight text-white">
                Cambodia&apos;s Digital{" "}
                <span className="relative">
                  <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[#19A6B6] via-[#4dd0e1] to-[#19A6B6]">
                    Teaching Library
                  </span>
                </span>
              </h1>

              <p className="mt-5 max-w-lg font-[family-name:var(--font-battambang)] text-[15px] leading-[1.8] text-slate-400 md:text-base">
                Access research, textbooks, and educational resources published by
                Phnom Penh Teacher Education College — free for all educators and students.
              </p>

              {/* Search */}
              <div className="mt-8 max-w-xl">
                <Suspense fallback={<div className="h-12 rounded-2xl bg-white/5 animate-pulse" />}>
                  <SearchBar />
                </Suspense>
              </div>

              {/* Department pills */}
              {deptPills.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    Browse
                  </span>
                  {deptPills.map((dept) => (
                    <Link
                      key={dept}
                      href={`/books?dept=${encodeURIComponent(dept)}`}
                      className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[12px] font-semibold text-slate-300 transition-all hover:border-[#19A6B6]/40 hover:bg-[#19A6B6]/10 hover:text-[#4dd0e1]"
                    >
                      {dept}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Animated book stack with real covers */}
            <div className="hidden lg:flex lg:items-center lg:justify-center">
              <div className="scale-[1.3] xl:scale-[1.5]">
                <HeroBookStack
                books={featuredBooks.map((b) => ({
                  slug:       b.slug,
                  title:      b.title,
                  author:     b.author,
                  coverUrl:   b.coverUrl ?? null,
                  coverColor: b.cover,
                  department: b.department,
                }))}
              />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom wave separator */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 48" fill="none" className="w-full text-[#F5F6FA]" preserveAspectRatio="none">
            <path d="M0 48h1440V24c-240 16-480 24-720 24S240 40 0 24v24z" fill="currentColor" />
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          STATS
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative -mt-1 pb-4">
        <div className="mx-auto max-w-[1400px] px-4 md:px-12">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {statItems.map(({ label, value, sub }) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-[#0C7C8A]/20 hover:shadow-md md:p-6"
              >
                {/* Icon */}
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#E4F4F5] text-[#0C7C8A] transition-colors group-hover:bg-[#0C7C8A] group-hover:text-white">
                  {statIcons[label]}
                </div>
                <div className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
                  {value}
                </div>
                <div className="mt-0.5 text-[13px] font-semibold text-[#0C7C8A]">{label}</div>
                <div className="mt-0.5 text-[11px] text-slate-400 hidden sm:block">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          FEATURED BOOKS
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-12 md:py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1 w-8 rounded-full bg-[#0C7C8A]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#0C7C8A]">
                Most Downloaded
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-950 md:text-3xl">
              Featured Resources
            </h2>
          </div>
          <Link
            href="/books?sort=downloads"
            className="group hidden shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-all hover:border-[#0C7C8A] hover:text-[#0C7C8A] sm:inline-flex"
          >
            View all
            <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>

        {featuredBooks.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
            No resources published yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {featuredBooks.map((book) => (
                <BookCard key={book.slug} book={book} />
              ))}
            </div>
            {/* Mobile view all */}
            <div className="mt-6 flex justify-center sm:hidden">
              <Link
                href="/books?sort=downloads"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm transition hover:border-[#0C7C8A] hover:text-[#0C7C8A]"
              >
                View all resources
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </div>
          </>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          RECENT POSTS
          ══════════════════════════════════════════════════════════════════════ */}
      {recentPosts.length > 0 && (
        <section className="border-t border-slate-200/60 bg-white">
          <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-12 md:py-16">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-1 w-8 rounded-full bg-[#0C7C8A]" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#0C7C8A]">
                    Latest
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-950 md:text-3xl">
                  From the Library
                </h2>
              </div>
              <Link
                href="/posts"
                className="group hidden shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-all hover:border-[#0C7C8A] hover:text-[#0C7C8A] sm:inline-flex"
              >
                All posts
                <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {recentPosts.map((post) => {
                const style = categoryStyles[post.category] ?? categoryStyles.Other;
                return (
                  <Link
                    key={post.id}
                    href={`/posts/${post.slug}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-12px_rgba(11,42,48,0.15)]"
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
                          <span className="line-clamp-3 text-center font-[family-name:var(--font-angkor)] text-lg leading-snug text-white/90">
                            {post.title}
                          </span>
                        </div>
                      )}

                      {/* Category pill on cover */}
                      <div className="absolute left-3 top-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full ${style.bg} px-2.5 py-1 text-[11px] font-bold ${style.text} backdrop-blur-sm`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          {post.category}
                        </span>
                      </div>

                      {/* Time ago */}
                      <div className="absolute right-3 top-3">
                        <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                          {timeAgo(post.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="mb-2 line-clamp-2 text-[15px] font-bold leading-snug text-slate-800 transition group-hover:text-[#0C7C8A]">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="mb-4 line-clamp-2 font-[family-name:var(--font-battambang)] text-[13px] leading-relaxed text-slate-500">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                        <div className="flex items-center gap-2">
                          {/* Author avatar placeholder */}
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E4F4F5] text-[10px] font-bold text-[#0C7C8A]">
                            {post.author.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate text-[12px] font-medium text-slate-600 max-w-[120px]">
                            {post.author}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          {post.views > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                              </svg>
                              {post.views}
                            </span>
                          )}
                          <span className="tabular-nums">{formatDate(post.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CTA BANNER
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden bg-[#0a1629]">
        {/* Decorative */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-[#0C7C8A]/15 blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-[1400px] px-4 py-16 text-center md:px-12 md:py-24">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm mb-6">
            <svg className="h-3.5 w-3.5 text-[#4dd0e1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="text-[12px] font-semibold text-slate-300">Open access for all</span>
          </div>

          <h2 className="font-[family-name:var(--font-angkor)] text-[clamp(24px,4vw,42px)] leading-tight text-white">
            Ready to explore the catalogue?
          </h2>
          <p className="mx-auto mt-4 max-w-lg font-[family-name:var(--font-battambang)] text-[14px] leading-relaxed text-slate-400 md:text-[15px]">
            Hundreds of educational resources — textbooks, research papers, and teaching
            guides — available free to every educator in Cambodia.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/books"
              className="group inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#0C7C8A] to-[#19A6B6] px-8 text-[14px] font-bold text-white shadow-lg shadow-[#0C7C8A]/25 transition-all hover:shadow-xl hover:shadow-[#0C7C8A]/30 hover:-translate-y-0.5"
            >
              Browse all resources
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
            <Link
              href="/catalogs"
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-8 text-[14px] font-semibold text-slate-300 backdrop-blur-sm transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              Physical Library
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}