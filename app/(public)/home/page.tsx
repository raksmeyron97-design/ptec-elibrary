// app/home/page.tsx
import React, { Suspense } from "react";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import BookCard from "@/components/ui/BookCard";
import CatalogCard from "@/components/ui/CatalogCard";
import SearchBar from "@/components/ui/SearchBar";
import HeroBookStack from "@/components/ui/HeroBookStack";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { CatalogBook } from "@/lib/catalog";

export const revalidate = 60;

// ── Data fetchers (UNCHANGED) ───────────────────────────────────────────────

async function getStats() {
  const supabase = createServiceClient();
  const [booksRes, downloadsRes, usersRes, viewsRes] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("books").select("download_count").eq("is_published", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("books").select("view_count").eq("is_published", true),
  ]);
  const totalDownloads = (downloadsRes.data ?? []).reduce((s, b) => s + (b.download_count ?? 0), 0);
  const totalViews = (viewsRes.data ?? []).reduce((s, b) => s + (b.view_count ?? 0), 0);
  return { books: booksRes.count ?? 0, downloads: totalDownloads, users: usersRes.count ?? 0, views: totalViews };
}

async function getFeaturedBooks() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select(`id, title, slug, description, cover_color, cover_url, language,
       published_at, department, pages, isbn, rating, download_count, view_count,
       authors(name), categories(name), book_files(format, file_url, file_size_kb)`)
    .eq("is_published", true)
    .order("download_count", { ascending: false })
    .limit(5);
  return (data ?? []).map(mapRowToBook);
}

async function getRecentPosts() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("posts")
    .select(`id, title, slug, category, excerpt, cover_url, created_at, views,
       author:profiles(full_name, email)`)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(3);
  return (data ?? []).map((p: any) => ({
    id: p.id as string,
    title: p.title as string,
    slug: p.slug as string,
    category: (p.category ?? "Other") as string,
    excerpt: (p.excerpt ?? null) as string | null,
    coverUrl: (p.cover_url ?? null) as string | null,
    author: (p.author?.full_name ?? p.author?.email ?? "PTEC Library") as string,
    createdAt: (p.created_at ?? null) as string | null,
    views: (p.views ?? 0) as number,
  }));
}

async function getRecentCatalogs() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("catalog_books")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);
  return (data ?? []) as CatalogBook[];
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
  for (const row of data ?? []) if (row.department) seen.add(row.department);
  return [...seen].slice(0, 8);
}

// ── Formatters (UNCHANGED) ──────────────────────────────────────────────────

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(iso);
}

// ── Brand-harmonized category badges ────────────────────────────────────────
const categoryStyles: Record<string, { bg: string; text: string; dot: string }> = {
  Research:     { bg: "bg-brand/5",  text: "text-brand",      dot: "bg-brand"     },
  Announcement: { bg: "bg-gold-50",  text: "text-gold-700",   dot: "bg-gold-500"  },
  Event:        { bg: "bg-brand/5",  text: "text-brand",   dot: "bg-blue-700"  },
  Journal:      { bg: "bg-gold-50",  text: "text-gold-700",   dot: "bg-gold-400"  },
  Other:        { bg: "bg-paper",    text: "text-text-muted", dot: "bg-slate-400" },
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

const CollectionIcon = () => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

// ── Page ────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const [stats, featuredBooks, recentPosts, deptPills, recentCatalogs] = await Promise.all([
    getStats(), getFeaturedBooks(), getRecentPosts(), getDepartmentPills(), getRecentCatalogs(),
  ]);

  const heroStats = [
    { label: "Resources", value: formatStat(stats.books) },
    { label: "Views",     value: formatStat(stats.views) },
    { label: "Downloads", value: formatStat(stats.downloads) },
    { label: "Educators", value: formatStat(stats.users) },
  ];

  return (
    <div className="min-h-screen bg-paper">

    
      {/* ════════ HERO (blue-forward, English) ════════ */}
      <section className="relative isolate overflow-hidden text-white">
        
        {/* 1. Background Image (បណ្ណាល័យ PTEC) */}
        <div className="absolute inset-0 -z-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src="/ptec-library.jpg" 
            alt="Phnom Penh Teacher Education College Library" 
            className="h-full w-full object-cover object-center"
          />
        </div>
        

        {/* 2. Dark Blue Overlay (កែត្រង់នេះ - ពណ៌ក្រាស់ខាងឆ្វេងសម្រាប់ឲ្យអក្សរលេច និងថ្លាខាងស្តាំដើម្បីឲ្យឃើញអគារច្បាស់) */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-950/95 via-blue-900/80 to-blue-900/10" />
        
        {/* 3. Subtle Gold Glow (បន្ថយពន្លឺមាសបន្តិច កុំឲ្យវាបាំងរូបអគារពេក) */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(820px_520px_at_88%_-10%,rgba(221,176,34,0.10),transparent_58%)]" />
        {/* subtle engraved decoration (បន្ថយ opacity មកត្រឹម 20 ដើម្បីកុំឲ្យរញ៉េរញ៉ៃជាមួយរូបអគារ) */}

        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-10"


          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)", backgroundSize: "26px 26px",
            maskImage: "radial-gradient(80% 80% at 20% 30%, #000, transparent 75%)" }} />
        <div aria-hidden className="pointer-events-none absolute -right-44 -top-48 h-[680px] w-[680px] rounded-full border border-white/[0.06]" />
        <div aria-hidden className="pointer-events-none absolute -left-40 -bottom-56 h-[420px] w-[420px] rounded-full border border-gold-500/10" />

        <div className="relative mx-auto max-w-[1400px] px-4 py-20 md:px-12 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">

            {/* Left */}
            <div className="max-w-2xl">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold-400 drop-shadow-md">
                Phnom Penh Teacher Education College
              </span>
              <h1 className="mt-4 font-khmer-serif text-[clamp(33px,5vw,52px)] font-bold leading-[1.1] tracking-tight text-white drop-shadow-lg">
                The Digital <span className="text-gold-400">Teaching Library</span>
              </h1>
              <p className="mt-5 max-w-lg text-[15px] leading-[1.75] text-blue-50 md:text-base drop-shadow-md">
                Research, textbooks, and teaching resources curated by Phnom Penh Teacher
                Education College — open and free for every educator and student.
              </p>

              {/* Search (existing component) */}
              <div className="mt-8 max-w-xl relative z-10">
                <Suspense fallback={<div className="h-12 rounded-xl bg-bg-surface/10 animate-pulse" />}>
                  <SearchBar />
                </Suspense>
              </div>

              {/* Browse dept links */}
              {deptPills.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">Browse</span>
                  {deptPills.slice(0, 5).map((dept) => (
                    <Link key={dept} href={`/books?dept=${encodeURIComponent(dept)}`}
                      className="border-b border-transparent pb-px text-[14px] text-blue-100 transition-colors hover:border-gold-500 hover:text-white">
                      {dept}
                    </Link>
                  ))}
                </div>
              )}

              {/* Slim stats strip */}
              <div className="mt-10 flex flex-wrap gap-x-11 gap-y-5 border-t border-white/10 pt-6">
                {heroStats.map((s) => (
                  <div key={s.label}>
                    <div className="font-khmer-serif text-2xl font-bold leading-none text-white drop-shadow-md">
                      {s.value}<span className="text-gold-400">+</span>
                    </div>
                    <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-300">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Book stack (like old code) */}
            <div className="hidden lg:flex lg:items-center lg:justify-end relative z-10 xl:pr-20">
              <div className="scale-[1.25] xl:scale-[1.65] drop-shadow-2xl translate-x-0 xl:translate-x-1">
                <HeroBookStack
                  books={featuredBooks.map((b) => ({
                    slug: b.slug,
                    title: b.title,
                    author: b.author,
                    coverUrl: b.coverUrl ?? null,
                    coverColor: b.cover,
                    department: b.department,
                  }))}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="h-[2px] w-full bg-gradient-to-r from-gold-500 via-gold-400 to-transparent" />
      </section>

      {/* ════════ FEATURED COLLECTIONS ════════ */}
      {deptPills.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
          <div className="mb-9 flex items-end justify-between gap-5">
            <SectionTitle as="h2" className="!mb-0">Featured Collections</SectionTitle>
            <Link href="/books" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold-700 sm:inline-flex">
              All departments →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {deptPills.slice(0, 4).map((dept) => (
              <Link key={dept} href={`/books?dept=${encodeURIComponent(dept)}`}
                className="group rounded-lg border border-divider border-t-[3px] border-t-accent bg-bg-surface p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/5 text-brand">
                  <CollectionIcon />
                </div>
                <h3 className="font-khmer-serif text-lg font-bold text-text-heading">{dept}</h3>
                <div className="mt-4 text-[12.5px] font-semibold text-gold-700">View resources →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ════════ NEW IN THE LIBRARY ════════ */}
      <section className="border-y border-divider bg-bg-surface">
        <div className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
          <div className="mb-9 flex items-end justify-between gap-5">
            <SectionTitle as="h2" className="!mb-0">New in the Library</SectionTitle>
            <Link href="/books?sort=downloads" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold-700 sm:inline-flex">
              Browse e-resources →
            </Link>
          </div>
          {featuredBooks.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-divider bg-paper text-sm text-text-muted">
              No resources published yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-5">
              {featuredBooks.map((book) => <BookCard key={book.slug} book={book} />)}
            </div>
          )}
        </div>
      </section>

      {/* ════════ FROM THE LIBRARY (catalogs) ════════ */}
      {recentCatalogs.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
          <div className="mb-9 flex items-end justify-between gap-5">
            <SectionTitle as="h2" className="!mb-0">From the Library</SectionTitle>
            <Link href="/catalogs" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold-700 sm:inline-flex">
              All physical books →
            </Link>
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 sm:gap-4">
            {recentCatalogs.map((book) => (
              <CatalogCard key={book.slug} book={book} />
            ))}
          </div>
        </section>
      )}

      {/* ════════ LATEST POSTS ════════ */}
      {recentPosts.length > 0 && (
        <section className="border-t border-divider bg-bg-surface">
          <div className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
            <div className="mb-9 flex items-end justify-between gap-5">
              <SectionTitle as="h2" className="!mb-0">Latest Posts</SectionTitle>
              <Link href="/posts" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold-700 sm:inline-flex">
                All posts →
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentPosts.map((post) => {
                const style = categoryStyles[post.category] ?? categoryStyles.Other;
                return (
                  <Link key={post.id} href={`/posts/${post.slug}`}
                    className="group flex flex-col overflow-hidden rounded-lg border border-divider bg-bg-surface shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
                    <div className="relative h-44 w-full overflow-hidden">
                      {post.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.coverUrl} alt={post.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${pickBanner(post.title)} p-6`}>
                          <span className="line-clamp-3 text-center font-khmer-serif text-lg font-bold leading-snug text-white/90">
                            {post.title}
                          </span>
                        </div>
                      )}
                      <div className="absolute left-3 top-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full ${style.bg} px-2.5 py-1 text-[11px] font-bold ${style.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />{post.category}
                        </span>
                      </div>
                      <div className="absolute right-3 top-3">
                        <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">{timeAgo(post.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="mb-2 line-clamp-2 font-khmer-serif text-[16px] font-bold leading-snug text-text-heading transition group-hover:text-brand">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="mb-4 line-clamp-2 text-[13px] leading-relaxed text-text-muted">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between border-t border-divider pt-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/5 text-[10px] font-bold text-brand">
                            {post.author.charAt(0).toUpperCase()}
                          </div>
                          <span className="max-w-[120px] truncate text-[12px] font-medium text-text-muted">{post.author}</span>
                        </div>
                        <span className="text-[11px] tabular-nums text-text-muted">{formatDate(post.createdAt)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ════════ CTA BANNER ════════ */}
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-900 to-blue-950">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative mx-auto max-w-[1400px] px-4 py-20 text-center md:px-12">
          <h2 className="font-khmer-serif text-[clamp(24px,4vw,40px)] font-bold leading-tight text-white">
            Ready to explore the catalogue?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-blue-200">
            Hundreds of educational resources — textbooks, research papers, and teaching
            guides — available free to every educator in Cambodia.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/books"><Button variant="gold" size="lg">Browse all resources →</Button></Link>
            <Link href="/catalogs"><Button variant="secondary" size="lg" className="!border-white/25 !bg-bg-surface/5 !text-white hover:!bg-bg-surface/10">Physical Library</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}