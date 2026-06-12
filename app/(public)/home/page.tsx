// app/(public)/home/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapRowToBook, BOOK_SELECT } from "@/lib/books";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import { Button } from "@/components/ui/core/Button";
import { getTranslations, getLocale } from "next-intl/server";

// ── Feature components ───────────────────────────────────────────────────────
import AskLibraryHero from "@/components/ui/home/AskLibraryHero";
import ContinueReading from "@/components/ui/home/ContinueReading";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import BrowseBooksSection from "@/components/ui/home/BrowseBooksSection";
import CatalogsSection from "@/components/ui/home/CatalogsSection";
import LatestPostsSection from "@/components/ui/home/LatestPostsSection";
import HomeBento from "@/components/ui/home/HomeBento";
import FeaturedCollectionsWrapper from "@/components/ui/home/FeaturedCollectionsWrapper";

import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";
import CatalogsSkeleton from "@/components/ui/home/skeletons/CatalogsSkeleton";
import LatestPostsSkeleton from "@/components/ui/home/skeletons/LatestPostsSkeleton";
import FeaturedCollectionsSkeleton from "@/components/ui/home/skeletons/FeaturedCollectionsSkeleton";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/home" },
};

// ── Data fetchers ────────────────────────────────────────────────────────────

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

// TODO: replace with search-frequency ordering when tracked
async function getTrendingTerms(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("name").order("name").limit(6);
  const names = (data ?? []).map((c: { name: string }) => c.name).filter(Boolean);
  return names.length ? names.slice(0, 6) : ["Pedagogy", "Mathematics", "Khmer Literature", "Science", "English"];
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const t = await getTranslations("home");
  const locale = await getLocale();

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

  // Locale-conditional classes (never uppercase Khmer)
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.22em]" : "tracking-normal";

  return (
    <div className="min-h-screen bg-paper">

      {/* ════════ HERO ════════ */}
      <section className="hero-ink relative isolate overflow-hidden text-white">
        {/* Aurora gradient layer */}
        <div className="aurora absolute inset-0 -z-10" aria-hidden />

        {/* Subtle dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle, #9bb8ff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <div className="relative mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">

            {/* ── Left column ── */}
            <div className="hero-stagger min-w-0 w-full max-w-2xl">
              {/* Gold eyebrow */}
              <div className="flex items-center gap-2">
                <span className="inline-block h-[5px] w-[5px] rounded-full bg-gold-400" aria-hidden />
                <span className={`text-[11px] font-bold text-gold-400 ${latinEyebrow}`}>
                  {t("tagline")}
                </span>
              </div>

              {/* Headline */}
              <h1
                className={`mt-3 font-khmer-serif font-bold text-white ${
                  locale === "km"
                    ? "leading-[1.4] tracking-normal"
                    : "leading-[1.1] tracking-tight"
                }`}
                style={{ fontSize: "clamp(28px, 3.8vw, 46px)" }}
              >
                {t("headline")}
              </h1>

              {/* Description */}
              <p className="mt-4 max-w-lg text-[15px] leading-[1.7] text-blue-100/90 md:text-[16px]">
                {t("description")}
              </p>

              {/* Ask bar */}
              <div className="mt-8 max-w-xl">
                <AskLibraryHero
                  trending={trendingTerms}
                  prompts={[t("prompt1"), t("prompt2"), t("prompt3")]}
                  askLabel={t("askButton")}
                  hint={t("askHint")}
                />
              </div>

              {/* Mobile book strip — unchanged component */}
              <div className="mt-10 lg:hidden">
                <MobileFeaturedStrip books={heroBooks} />
              </div>
            </div>

            {/* ── Right column — desktop book stack ── */}
            <div className="relative hidden lg:flex lg:items-center lg:justify-center">
              {/* Ambient glow pool behind the stack */}
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-400/15 blur-[90px]" />
                <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-gold-500/12 blur-[80px]" />
              </div>
              <div className="relative scale-110">
                <HeroBookStack books={heroBooks} />
              </div>
            </div>

          </div>
        </div>

        {/* Gold seam */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-400/80 to-transparent" />
      </section>

      {/* ════════ BENTO (replaces stats strip) ════════ */}
      <Suspense fallback={<div className="h-48 animate-pulse bg-bg-surface border-b border-divider/60" />}>
        <HomeBento />
      </Suspense>

      {/* ════════ CONTINUE READING ════════ */}
      <Suspense fallback={null}>
        <ContinueReading />
      </Suspense>

      {/* ════════ FEATURED COLLECTIONS ════════ */}
      <Suspense fallback={<FeaturedCollectionsSkeleton />}>
        <FeaturedCollectionsWrapper />
      </Suspense>

      {/* ════════ BROWSE: Trending / Recently Added ════════ */}
      <Suspense fallback={<BrowseBooksSkeleton />}>
        <BrowseBooksSection trendingBooks={trendingBooks} />
      </Suspense>

      {/* ════════ FROM THE LIBRARY (catalogs) ════════ */}
      <Suspense fallback={<CatalogsSkeleton />}>
        <CatalogsSection />
      </Suspense>

      {/* ════════ LATEST POSTS ════════ */}
      <Suspense fallback={<LatestPostsSkeleton />}>
        <LatestPostsSection />
      </Suspense>

      {/* ════════ CTA BANNER ════════ */}
      <section className="hero-ink relative isolate overflow-hidden">
        <div className="aurora aurora--dim absolute inset-0 -z-10" aria-hidden />
        <div className="relative mx-auto max-w-[1400px] px-4 py-14 sm:py-18 md:px-12 md:py-20 text-center">
          <h2
            className="font-khmer-serif font-bold text-white"
            style={{ fontSize: "clamp(22px, 3.4vw, 38px)" }}
          >
            {t("ctaHeading")}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-blue-200 sm:text-[15px]">
            {t("ctaBody")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/books" className="w-full sm:w-auto">
              <Button variant="gold" size="lg" className="w-full sm:w-auto">{t("ctaBrowse")}</Button>
            </Link>
            <Link href="/catalogs" className="w-full sm:w-auto">
              <Button
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto !border-white/25 !bg-white/5 !text-white hover:!bg-white/10"
              >
                {t("ctaPhysical")}
              </Button>
            </Link>
          </div>
        </div>
        {/* Gold seam */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-400/60 to-transparent" />
      </section>
    </div>
  );
}
