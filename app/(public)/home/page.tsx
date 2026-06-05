// app/(public)/home/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import SearchBar from "@/components/ui/search/SearchBar";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import { Button } from "@/components/ui/core/Button";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { getTranslations, getLocale } from 'next-intl/server';
import Image from "next/image";

// ── Feature components (live in components/ui/home/) ────────────────────────
import ContinueReading from "@/components/ui/home/ContinueReading";
import SearchSuggestions from "@/components/ui/home/SearchSuggestions";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import FeaturedCollections from "@/components/ui/home/FeaturedCollections";
import BrowseBooksSection from "@/components/ui/home/BrowseBooksSection";
import CatalogsSection from "@/components/ui/home/CatalogsSection";
import LatestPostsSection from "@/components/ui/home/LatestPostsSection";
import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";
import CatalogsSkeleton from "@/components/ui/home/skeletons/CatalogsSkeleton";
import LatestPostsSkeleton from "@/components/ui/home/skeletons/LatestPostsSkeleton";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/home" },
};

// ── Data fetchers ───────────────────────────────────────────────────────────
async function getStats() {
  const supabase = await createClient();
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
   authors(name), categories(name), departments(name), book_files(format, file_url, file_size_kb), reviews(rating)`;

// #2 — Trending = most downloaded
async function getTrendingBooks() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("is_published", true)
    .order("download_count", { ascending: false })
    .limit(10);
  return (data ?? []).map(mapRowToBook);
}



async function getDepartmentPills(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("books")
    .select("departments!inner(name)")
    .eq("is_published", true);
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const dept = (row.departments as any)?.name;
    if (dept) seen.add(dept);
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, 8);
}

// #4 — trending search chips. Falls back to a curated list if categories are empty.
async function getTrendingTerms(): Promise<string[]> {
  const supabase = await createClient();
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
  const t = await getTranslations('home');
  const locale = await getLocale();
  const latinEyebrow = locale === 'en' ? 'uppercase tracking-[0.22em]' : 'tracking-normal';
  const latinLabel   = locale === 'en' ? 'uppercase tracking-[0.18em]' : 'tracking-normal';
  const latinCaption = locale === 'en' ? 'uppercase tracking-[0.12em]' : 'tracking-normal';
  const [stats, trendingBooks, deptPills, trendingTerms] = await Promise.all([
    getStats(),
    getTrendingBooks(),
    getDepartmentPills(),
    getTrendingTerms(),
  ]);

  const heroStats = [
    { label: t("statResources"), value: formatStat(stats.books) },
    { label: t("statViews"),     value: formatStat(stats.views) },
    { label: t("statDownloads"), value: formatStat(stats.downloads) },
    { label: t("statEducators"), value: formatStat(stats.users) },
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
          <Image
            src="/ptec-library.jpg"
            alt=""
            aria-hidden="true"
            fill
            priority
            className="object-cover object-center"
          />
        </div>

        {/* 2. Dark blue overlay */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-950/95 via-blue-900/85 to-blue-900/70 sm:to-blue-900/10" />
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

        <div className="relative mx-auto max-w-[1400px] px-4 py-10 sm:py-16 md:px-12 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">

            {/* Left — min-w-0 prevents mobile horizontal overflow */}
            <div className="min-w-0 w-full max-w-2xl">
              <span className={`text-[11px] font-bold text-gold-400 drop-shadow-md ${latinEyebrow}`}>
                {t('tagline')}
              </span>
              <h1
                className={`mt-3 sm:mt-4 font-khmer-serif text-[clamp(28px,5vw,52px)] font-bold text-white drop-shadow-lg ${
                  locale === 'km' ? 'leading-[1.4] tracking-normal' : 'leading-[1.1] tracking-tight'
                }`}
              >
                {t('headline')}
              </h1>
              <p className="mt-3 sm:mt-5 max-w-lg text-[14px] sm:text-[15px] leading-[1.75] text-blue-50 md:text-base drop-shadow-md">
                {t('description')}
              </p>

              {/* Search + #4 suggestion chips */}
              <div className="mt-5 sm:mt-8 max-w-xl relative z-10">
                <Suspense fallback={<div className="h-12 rounded-xl bg-bg-surface/10 animate-pulse" />}>
                  <SearchBar placeholder={t('searchPlaceholder')} buttonLabel={t('searchButton')} />
                </Suspense>
                <SearchSuggestions trending={trendingTerms} />
              </div>

              {/* Browse dept links */}
              {deptPills.length > 0 && (
                <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-x-3 sm:gap-x-5 gap-y-2">
                  <span className={`text-[11px] font-bold text-blue-300 ${latinLabel}`}>{t('browse')}</span>
                  {deptPills.slice(0, 5).map((dept) => (
                    <Link
                      key={dept}
                      href={`/books?dept=${encodeURIComponent(dept)}`}
                      className="border-b border-transparent pb-px text-[13px] sm:text-[14px] text-blue-100 transition-colors hover:border-gold-500 hover:text-white"
                    >
                      {dept}
                    </Link>
                  ))}
                </div>
              )}

              {/* Slim stats strip */}
              <div className="mt-6 sm:mt-10 grid grid-cols-4 gap-3 sm:flex sm:flex-wrap sm:gap-x-11 sm:gap-y-5 border-t border-white/10 pt-4 sm:pt-6">
                {heroStats.map((s) => (
                  <div key={s.label}>
                    <div className="font-khmer-serif text-lg sm:text-2xl font-bold leading-none text-white drop-shadow-md">
                      {s.value}<span className="text-gold-400">+</span>
                    </div>
                    <div className={`mt-1 sm:mt-1.5 text-[10px] sm:text-[11px] font-semibold text-blue-300 ${latinCaption}`}>{s.label}</div>
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
        <section className="mx-auto max-w-[1400px] px-4 py-10 sm:py-14 md:px-12 md:py-20">
          <div className="mb-6 sm:mb-9 flex items-end justify-between gap-5">
            <SectionTitle as="h2" className="!mb-0">{t('featuredCollections')}</SectionTitle>
            <Link href="/books" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-gold-700 sm:inline-flex">
              {t('allDepartments')}
            </Link>
          </div>
          <FeaturedCollections departments={deptPills} limit={4} />
        </section>
      )}

      {/* ════════ BROWSE: Trending / Recently Added (#2 + #3 carousel) ════════ */}
      <Suspense fallback={<BrowseBooksSkeleton />}>
        <BrowseBooksSection trendingBooks={trendingBooks} />
      </Suspense>

      {/* ════════ FROM THE LIBRARY (catalogs) ════════ */}
      <Suspense fallback={<CatalogsSkeleton />}>
        <CatalogsSection />
      </Suspense>

      {/* ════════ LATEST POSTS (editorial: featured + list) ════════ */}
      <Suspense fallback={<LatestPostsSkeleton />}>
        <LatestPostsSection />
      </Suspense>

      {/* ════════ CTA BANNER ════════ */}
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-900 to-blue-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:py-20 text-center md:px-12">
          <h2 className="font-khmer-serif text-[clamp(22px,4vw,40px)] font-bold leading-tight text-white">
            {t('ctaHeading')}
          </h2>
          <p className="mx-auto mt-3 sm:mt-4 max-w-lg text-[14px] sm:text-[15px] leading-relaxed text-blue-200">
            {t('ctaBody')}
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <Link href="/books" className="w-full sm:w-auto"><Button variant="gold" size="lg" className="w-full sm:w-auto">{t('ctaBrowse')}</Button></Link>
            <Link href="/catalogs" className="w-full sm:w-auto"><Button variant="secondary" size="lg" className="w-full sm:w-auto !border-white/25 !bg-bg-surface/5 !text-white hover:!bg-bg-surface/10">{t('ctaPhysical')}</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}