// app/(public)/home/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapRowToBook, BOOK_SELECT } from "@/lib/books";
import SearchBar from "@/components/ui/search/SearchBar";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import { Button } from "@/components/ui/core/Button";
import { getTranslations, getLocale } from 'next-intl/server';
import Image from "next/image";

// ── Feature components (live in components/ui/home/) ────────────────────────
import ContinueReading from "@/components/ui/home/ContinueReading";
import SearchSuggestions from "@/components/ui/home/SearchSuggestions";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import BrowseBooksSection from "@/components/ui/home/BrowseBooksSection";
import CatalogsSection from "@/components/ui/home/CatalogsSection";
import LatestPostsSection from "@/components/ui/home/LatestPostsSection";
import HeroStatsStrip from "@/components/ui/home/HeroStatsStrip";
import FeaturedCollectionsWrapper from "@/components/ui/home/FeaturedCollectionsWrapper";

import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";
import CatalogsSkeleton from "@/components/ui/home/skeletons/CatalogsSkeleton";
import LatestPostsSkeleton from "@/components/ui/home/skeletons/LatestPostsSkeleton";
import HeroStatsSkeleton from "@/components/ui/home/skeletons/HeroStatsSkeleton";
import FeaturedCollectionsSkeleton from "@/components/ui/home/skeletons/FeaturedCollectionsSkeleton";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/home" },
};

// ── Data fetchers ───────────────────────────────────────────────────────────

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

// #4 — trending search chips. Falls back to a curated list if categories are empty.
async function getTrendingTerms(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("name").limit(6);
  const names = (data ?? []).map((c: any) => c.name).filter(Boolean) as string[];
  return names.length ? names.slice(0, 6) : ["Pedagogy", "Mathematics", "Khmer Literature", "Science", "English"];
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const t = await getTranslations('home');
  const locale = await getLocale();
  const latinEyebrow = locale === 'en' ? 'uppercase tracking-[0.22em]' : 'tracking-normal';

  const [trendingBooks, trendingTerms] = await Promise.all([
    getTrendingBooks(),
    getTrendingTerms(),
  ]);

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
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>

        {/* 2. Dark blue overlay - Simplified for clarity */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-950/95 via-blue-900/90 to-blue-900/60" />

        <div className="relative mx-auto max-w-[1400px] px-4 py-16 sm:py-20 md:px-12 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">

            {/* Left — min-w-0 prevents mobile horizontal overflow */}
            <div className="min-w-0 w-full max-w-2xl">
              <span className={`text-[11px] font-bold text-gold-400 drop-shadow-md ${latinEyebrow}`}>
                {t('tagline')}
              </span>
              <h1
                className={`mt-3 sm:mt-4 font-khmer-serif text-[clamp(28px,4vw,48px)] font-bold text-white drop-shadow-lg ${
                  locale === 'km' ? 'leading-[1.4] tracking-normal' : 'leading-[1.1] tracking-tight'
                }`}
              >
                {t('headline')}
              </h1>
              <p className="mt-3 sm:mt-6 max-w-lg text-[15px] sm:text-[16px] leading-[1.7] text-blue-50 md:text-lg md:max-w-xl drop-shadow-md">
                {t('description')}
              </p>

              {/* Search + #4 suggestion chips */}
              <div className="mt-6 sm:mt-10 max-w-xl relative z-10">
                <Suspense fallback={<div className="h-14 rounded-xl bg-bg-surface/10 animate-pulse" />}>
                  <SearchBar placeholder={t('searchPlaceholder')} buttonLabel={t('searchButton')} />
                </Suspense>
                <div className="mt-4">
                  <SearchSuggestions trending={trendingTerms} />
                </div>
              </div>

              {/* #5 — mobile-only featured covers strip */}
              <div className="mt-10 sm:hidden">
                <MobileFeaturedStrip books={heroBooks} />
              </div>
            </div>

            {/* Right: animated book stack (desktop) */}
            <div className="hidden lg:flex lg:items-center lg:justify-end relative z-10 xl:pr-20">
              <div className="scale-[1.25] xl:scale-[1.65] drop-shadow-2xl translate-x-0 xl:translate-x-1">
                <HeroBookStack books={heroBooks} />
              </div>
            </div>
          </div>
        </div>
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
      </section>

      {/* ════════ STATS STRIP (Suspended to unblock TTFB) ════════ */}
      <Suspense fallback={<HeroStatsSkeleton />}>
        <HeroStatsStrip />
      </Suspense>

      {/* ════════ CONTINUE READING (personalized — renders only when logged in) ════════ */}
      <Suspense fallback={null}>
        <ContinueReading />
      </Suspense>

      {/* ════════ FEATURED COLLECTIONS (#6 — themed per department) ════════ */}
      <Suspense fallback={<FeaturedCollectionsSkeleton />}>
        <FeaturedCollectionsWrapper />
      </Suspense>

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
        {/* Ambient orbs */}
        <div aria-hidden className="pointer-events-none absolute -z-10 -top-20 left-1/4 h-[360px] w-[360px] rounded-full bg-blue-600/25 blur-[100px] animate-float-orb" />
        <div aria-hidden className="pointer-events-none absolute -z-10 bottom-0 right-1/4 h-[240px] w-[240px] rounded-full bg-gold-500/15 blur-[80px] animate-float-orb-slow" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:py-20 text-center md:px-12">
          {/* Glass content panel */}
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-10 backdrop-blur-sm sm:px-10 sm:py-12">
            <h2 className="font-khmer-serif text-[clamp(22px,4vw,40px)] font-bold leading-tight text-white drop-shadow-lg">
              {t('ctaHeading')}
            </h2>
            <p className="mx-auto mt-3 sm:mt-4 max-w-lg text-[14px] sm:text-[15px] leading-relaxed text-blue-200">
              {t('ctaBody')}
            </p>
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <Link href="/books" className="w-full sm:w-auto"><Button variant="gold" size="lg" className="w-full sm:w-auto">{t('ctaBrowse')}</Button></Link>
              <Link href="/catalogs" className="w-full sm:w-auto"><Button variant="secondary" size="lg" className="w-full sm:w-auto !border-white/25 !bg-bg-surface/5 !text-white hover:!bg-bg-surface/10">{t('ctaPhysical')}</Button></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}