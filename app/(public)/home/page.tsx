// app/(public)/home/page.tsx
import { Suspense } from "react";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import CatalogCard from "@/components/ui/CatalogCard";
import SearchBar from "@/components/ui/SearchBar";
import HeroBookStack from "@/components/ui/HeroBookStack";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { CatalogBook } from "@/lib/catalog";

// ── Feature components (live in components/ui/home/) ────────────────────────
import ContinueReading from "@/components/ui/home/ContinueReading";
import BookShowcaseTabs from "@/components/ui/home/BookShowcaseTabs";
import SearchSuggestions from "@/components/ui/home/SearchSuggestions";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import FeaturedCollections from "@/components/ui/home/FeaturedCollections";
import LatestPosts from "@/components/ui/home/LatestPosts";

export const revalidate = 60;

// ── Data fetchers ───────────────────────────────────────────────────────────

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

const BOOK_SELECT = `id, title, slug, description, cover_color, cover_url, language,
   published_at, department, pages, isbn, rating, download_count, view_count,
   authors(name), categories(name), book_files(format, file_url, file_size_kb)`;

// #2 — Trending = most downloaded
async function getTrendingBooks() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("is_published", true)
    .order("download_count", { ascending: false })
    .limit(10);
  return (data ?? []).map(mapRowToBook);
}

// #2 — Recently Added = newest by publish date
async function getRecentlyAdded() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(10);
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
    .limit(4);
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

// #4 — trending search chips. Falls back to a curated list if categories are empty.
async function getTrendingTerms(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("categories").select("name").limit(6);
  const names = (data ?? []).map((c: any) => c.name).filter(Boolean) as string[];
  return names.length ? names.slice(0, 6) : ["Pedagogy", "Mathematics", "Khmer Literature", "Science", "English"];
}

// ── Formatter (hero stats) ───────────────────────────────────────────────────
function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const [stats, trendingBooks, recentlyAdded, recentPosts, deptPills, recentCatalogs, trendingTerms] =
    await Promise.all([
      getStats(),
      getTrendingBooks(),
      getRecentlyAdded(),
      getRecentPosts(),
      getDepartmentPills(),
      getRecentCatalogs(),
      getTrendingTerms(),
    ]);

  const heroStats = [
    { label: "Resources", value: formatStat(stats.books) },
    { label: "Views",     value: formatStat(stats.views) },
    { label: "Downloads", value: formatStat(stats.downloads) },
    { label: "Educators", value: formatStat(stats.users) },
  ];

  const heroBooks = trendingBooks.slice(0, 8).map((b) => ({
    slug: b.slug,
    title: b.title,
    author: b.author,
    coverUrl: b.coverUrl ?? null,
    coverColor: b.cover,
    department: b.department,
  }));

  return (
    <div className="min-h-screen bg-paper">

      {/* ════════ HERO (blue-forward, English) ════════ */}
      <section className="relative isolate overflow-hidden text-white">
        {/* 1. Background image (PTEC library) */}
        <div className="absolute inset-0 -z-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ptec-library.jpg"
            alt="Phnom Penh Teacher Education College Library"
            className="h-full w-full object-cover object-center"
          />
        </div>

        {/* 2. Dark blue overlay */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-950/95 via-blue-900/80 to-blue-900/10" />
        {/* 3. Subtle gold glow */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(820px_520px_at_88%_-10%,rgba(221,176,34,0.10),transparent_58%)]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(80% 80% at 20% 30%, #000, transparent 75%)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-44 -top-48 h-[680px] w-[680px] rounded-full border border-white/[0.06]" />
        <div aria-hidden className="pointer-events-none absolute -left-40 -bottom-56 h-[420px] w-[420px] rounded-full border border-gold-500/10" />

        <div className="relative mx-auto max-w-[1400px] px-4 py-20 md:px-12 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">

            {/* Left — min-w-0 prevents mobile horizontal overflow */}
            <div className="min-w-0 w-full max-w-2xl">
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

              {/* Search + #4 suggestion chips */}
              <div className="mt-8 max-w-xl relative z-10">
                <Suspense fallback={<div className="h-12 rounded-xl bg-bg-surface/10 animate-pulse" />}>
                  <SearchBar />
                </Suspense>
                <SearchSuggestions trending={trendingTerms} />
              </div>

              {/* Browse dept links */}
              {deptPills.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">Browse</span>
                  {deptPills.slice(0, 5).map((dept) => (
                    <Link
                      key={dept}
                      href={`/books?dept=${encodeURIComponent(dept)}`}
                      className="border-b border-transparent pb-px text-[14px] text-blue-100 transition-colors hover:border-gold-500 hover:text-white"
                    >
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

              {/* #5 — mobile-only featured covers strip */}
              <MobileFeaturedStrip books={heroBooks} />
            </div>

            {/* Right: animated book stack (desktop) */}
            <div className="hidden lg:flex lg:items-center lg:justify-end relative z-10 xl:pr-20">
              <div className="scale-[1.25] xl:scale-[1.65] drop-shadow-2xl translate-x-0 xl:translate-x-1">
                <HeroBookStack books={heroBooks} />
              </div>
            </div>
          </div>
        </div>
        <div className="h-[2px] w-full bg-gradient-to-r from-gold-500 via-gold-400 to-transparent" />
      </section>

      {/* ════════ CONTINUE READING (personalized — renders only when logged in) ════════ */}
      <Suspense fallback={null}>
        <ContinueReading />
      </Suspense>

      {/* ════════ FEATURED COLLECTIONS (#6 — themed per department) ════════ */}
      {deptPills.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
          <div className="mb-9 flex items-end justify-between gap-5">
            <SectionTitle as="h2" className="!mb-0">Featured Collections</SectionTitle>
            <Link href="/books" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold-700 sm:inline-flex">
              All departments →
            </Link>
          </div>
          <FeaturedCollections departments={deptPills} limit={4} />
        </section>
      )}

      {/* ════════ BROWSE: Trending / Recently Added (#2 + #3 carousel) ════════ */}
      <section className="border-y border-divider bg-bg-surface">
        <div className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
          <BookShowcaseTabs trending={trendingBooks} recent={recentlyAdded} />
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

      {/* ════════ LATEST POSTS (editorial: featured + list) ════════ */}
      {recentPosts.length > 0 && <LatestPosts posts={recentPosts} />}

      {/* ════════ CTA BANNER ════════ */}
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-900 to-blue-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
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