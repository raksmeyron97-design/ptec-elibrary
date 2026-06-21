/* eslint-disable @typescript-eslint/no-unused-vars */
// app/(public)/home/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapRowToBook, BOOK_SELECT } from "@/lib/books";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import HeroStats from "@/components/ui/home/HeroStats";
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

import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";
import CatalogsSkeleton from "@/components/ui/home/skeletons/CatalogsSkeleton";
import LatestPostsSkeleton from "@/components/ui/home/skeletons/LatestPostsSkeleton";
import InteractiveAurora from "@/components/ui/animations/InteractiveAurora";

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
    .limit(60); // 60 so BrowseBooksSection can group up to 6 depts × 10 books
  return (data ?? []).map(mapRowToBook);
}

// TODO: replace with search-frequency ordering when tracked
async function getTrendingTerms(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("name").order("name").limit(6);
  const names = (data ?? []).map((c: { name: string }) => c.name).filter(Boolean);
  return names.length ? names.slice(0, 6) : ["Pedagogy", "Mathematics", "Khmer Literature", "Science", "English"];
}

async function getHomeStats() {
  const supabase = await createClient();
  const [booksRes, downloadsRes, usersRes, viewsRes] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("books").select("download_count").eq("is_published", true),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("books").select("view_count").eq("is_published", true),
  ]);
  const totalDownloads = (downloadsRes.data ?? []).reduce((s: number, b: { download_count?: number | null }) => s + (b.download_count ?? 0), 0);
  const totalViews = (viewsRes.data ?? []).reduce((s: number, b: { view_count?: number | null }) => s + (b.view_count ?? 0), 0);
  return { books: booksRes.count ?? 0, downloads: totalDownloads, users: usersRes.count ?? 0, views: totalViews };
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const t = await getTranslations("home");
  const locale = await getLocale();

  const supabase = await createClient();
  const [trendingBooks, trendingTerms, homeStats, { data: { user } }] = await Promise.all([
    getTrendingBooks(),
    getTrendingTerms(),
    getHomeStats(),
    supabase.auth.getUser(),
  ]);

  const heroBooks = trendingBooks.slice(0, 8).map((b) => ({
    slug: b.slug,
    title: b.title,
    author: b.author,
    coverUrl: b.coverUrl ?? null,
    coverColor: b.cover,
    department: b.department,
  }));

  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.22em]" : "tracking-normal";

  return (
    <div className="min-h-screen bg-paper">

      {/* ════════ HERO ════════ */}
      <section className="hero-ink relative isolate z-40 text-white">

        {/* Background wrapper with overflow-hidden so blurs/scales don't leak */}
        <div className="absolute inset-0 -z-30 overflow-hidden pointer-events-none">
          {/* 1. Photo background — LCP image */}
          <div className="absolute inset-0" aria-hidden>
            <Image
              src="/ptec-library.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              quality={70}
              className="object-cover object-center"
            />
          </div>

          {/* 2a. Left-to-right ink overlay: text column reads clearly, photo shows on right */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-[#060B1A]/95 via-[#0A1430]/85 to-[#0D1B3E]/60"
          />
          {/* 2b. Bottom fade: photo melts into the next section */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-[#060B1A]/90 via-transparent to-[#060B1A]/40"
          />

          {/* 3. Subtle dot grid — depth texture */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* 4. CSS aurora overlay */}
          <div className="aurora absolute inset-0 opacity-50" aria-hidden />

          {/* 4. Interactive mouse-tracking glow (client island, page stays RSC) */}
          {/* <InteractiveAurora className="absolute inset-0" /> */}
        </div>

        <div className="relative mx-auto max-w-[1400px] px-4 py-14 sm:py-20 md:px-12 md:py-24 lg:py-28">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">

            {/* ── Left column ── */}
            <div className="hero-stagger min-w-0 w-full max-w-2xl">
              {/* Gold eyebrow — pill badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/[0.09] px-3 py-1.5 backdrop-blur-sm">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden />
                <span className={`text-[11px] font-bold text-gold-400 ${latinEyebrow}`}>
                  {t("tagline")}
                </span>
              </div>

              {/* Headline */}
              <h1
                className={`mt-3 font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] ${
                  locale === "km"
                    ? "font-khmer-serif leading-[1.4] tracking-normal"
                    : "font-serif leading-[1.06] tracking-tight"
                }`}
                style={{ fontSize: "clamp(30px, 4.4vw, 58px)" }}
              >
                {t("headline")}
              </h1>

              {/* Description */}
              <p className="mt-4 max-w-lg text-[15px] leading-[1.7] text-blue-100/90 md:text-[16px]">
                {t("description")}
              </p>

              {/* Ask bar */}
              <div className="relative z-50 mt-8 max-w-xl">
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

              {/* Ledger Rail stats — inside the dark hero */}
              <HeroStats stats={homeStats} />

            </div>

            {/* ── Right column — desktop book stack ── */}
            <div className="relative hidden lg:flex lg:items-center lg:justify-center">
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute -right-8 -top-8 h-72 w-72 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.25)_0%,transparent_60%)]" />
                <div className="absolute -bottom-4 -left-8 h-64 w-64 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.2)_0%,transparent_60%)]" />
                <div className="absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgba(37,99,235,0.18),transparent)]" />
              </div>
              <div className="relative scale-110">
                <HeroBookStack books={heroBooks} />
              </div>
            </div>

          </div>
        </div>

        {/* Gold seam at the bottom of the hero */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-400/80 to-transparent" />
      </section>

      {/* ════════ BENTO ════════ */}
      <Suspense fallback={<div className="h-48 animate-pulse bg-bg-surface border-b border-divider/60" />}>
        <HomeBento />
      </Suspense>

      {/* ════════ CONTINUE READING ════════ */}
      <Suspense fallback={null}>
        <ContinueReading />
      </Suspense>

      {/* ════════ BROWSE: Trending / Recently Added + Dept chips ════════ */}
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

      {/* ════════ CTA BANNER — logged-out visitors only ════════ */}
      {!user && (
        <section className="hero-ink relative overflow-hidden">
          <div className="aurora absolute inset-0" aria-hidden />
          {/* Dot grid for consistency with hero */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <div className="relative mx-auto max-w-[1400px] px-4 py-16 sm:py-20 md:px-12 md:py-24 text-center">
            {/* Gold eyebrow line */}
            <div className="mb-4 flex items-center justify-center gap-3">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-gold-400/60" aria-hidden />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold-400">
                Free for educators
              </span>
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-gold-400/60" aria-hidden />
            </div>

            <h2
              className="font-khmer-serif font-bold text-white"
              style={{ fontSize: "clamp(24px, 3.4vw, 42px)" }}
            >
              {t("ctaHeading")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-blue-200/90 sm:text-[16px]">
              {t("ctaBody")}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <Link href="/books" className="w-full sm:w-auto">
                <Button variant="gold" size="lg" className="w-full sm:w-auto">{t("ctaBrowse")}</Button>
              </Link>
              <Link href="/signup" className="w-full sm:w-auto">
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
          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-400/60 to-transparent" />
        </section>
      )}
    </div>
  );
}
