// app/(public)/home/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import { preload } from "react-dom";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTrendingBooksCached, getTrendingTermsCached } from "@/lib/home-data";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import { getTranslations, getLocale } from "next-intl/server";
import { getHomeStats as fetchHomeStats } from "@/lib/home-stats";
// ── Feature components ───────────────────────────────────────────────────────
import AskLibraryHero from "@/components/ui/home/AskLibraryHero";
import ContinueReading from "@/components/ui/home/ContinueReading";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import BrowseBooksSection from "@/components/ui/home/BrowseBooksSection";
import FeaturedBooksSection from "@/components/ui/home/FeaturedBooksSection";
import FeaturedPublications from "@/components/ui/home/FeaturedPublications";
import CategoryGrid from "@/components/ui/home/CategoryGrid";
import TrendingResearch from "@/components/ui/home/TrendingResearch";
import HowToUse from "@/components/ui/home/HowToUse";
import FaqSection from "@/components/ui/home/FaqSection";

import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Free Teaching Resources & Educational Books",
  description: "PTEC Digital Library — free textbooks, teaching resources, and research reports from Phnom Penh Teacher Education College (PTEC). Available in Khmer and English.",
  alternates: { canonical: "/home" },
  openGraph: {
    title: "PTEC Digital Library — Free Teaching Resources",
    description: "Browse free textbooks, teaching materials, and research reports from Phnom Penh Teacher Education College. Available online in Khmer and English.",
    type: "website",
  },
};

// ── Data fetchers ────────────────────────────────────────────────────────────
// Public list data comes from lib/home-data.ts (unstable_cache, 5-min TTL) so
// each request only pays for the per-user auth check, not four table scans.

async function getHomeStats() {
  const raw = await fetchHomeStats();
  return {
    books: raw.resources ?? 0,
    views: raw.views ?? 0,
    downloads: raw.downloads ?? 0,
    users: raw.members ?? 0,
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  // LCP: preload the hero photo (AVIF branch — ~95% of browsers; the rest
  // simply fetch it via <picture> without the head start).
  preload("/hero/ptec-library-960.avif", {
    as: "image",
    type: "image/avif",
    imageSrcSet:
      "/hero/ptec-library-640.avif 640w, /hero/ptec-library-960.avif 960w, /hero/ptec-library-1440.avif 1440w",
    imageSizes: "100vw",
    fetchPriority: "high",
  });

  const t = await getTranslations("home");
  const locale = await getLocale();

  const supabase = await createClient();
  const [trendingBooks, trendingTerms, homeStats, { data: { user } }] = await Promise.all([
    getTrendingBooksCached(),
    getTrendingTermsCached(),
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
          {/* 1. Photo background — LCP image.
              Pre-generated variants (scripts/optimize-hero.mjs): AVIF/WebP at
              640/960/1440w — no runtime transform (images.unoptimized). The
              image is decorative (gradient overlays carry the text contrast),
              so alt="" + aria-hidden wrapper is intentional. */}
          <div className="absolute inset-0" aria-hidden>
            <picture>
              <source
                type="image/avif"
                srcSet="/hero/ptec-library-640.avif 640w, /hero/ptec-library-960.avif 960w, /hero/ptec-library-1440.avif 1440w"
                sizes="100vw"
              />
              <source
                type="image/webp"
                srcSet="/hero/ptec-library-640.webp 640w, /hero/ptec-library-960.webp 960w, /hero/ptec-library-1440.webp 1440w"
                sizes="100vw"
              />
              <img
                src="/hero/ptec-library-960.jpg"
                alt=""
                width={1440}
                height={959}
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            </picture>
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
                className={`mt-3 font-bold text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)] ${
                  locale === "km"
                    ? "font-khmer-serif leading-[1.4] tracking-normal"
                    : "font-serif leading-[1.06] tracking-[-0.025em]"
                }`}
                style={{ fontSize: "clamp(32px, 4.6vw, 62px)" }}
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
                  askLabel={t("searchButton")}
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

      {/* ════════ FEATURED PUBLICATIONS — journal articles, slot 2 ════════ */}
      <Suspense fallback={<div className="h-56 animate-pulse border-b border-divider/60 bg-bg-surface" aria-hidden />}>
        <FeaturedPublications />
      </Suspense>

      {/* Below-the-fold sections are wrapped in .cv-auto (content-visibility)
          so the browser skips their layout/paint work until scrolled near. */}

      {/* ════════ CATEGORIES — browse by subject, slot 3 ════════ */}
      <div className="cv-auto">
        <Suspense fallback={<div className="h-48 animate-pulse border-b border-divider/60 bg-paper" aria-hidden />}>
          <CategoryGrid />
        </Suspense>
      </div>

      {/* ════════ FEATURED EDITORIAL ════════ */}
      <div className="cv-auto">
        <FeaturedBooksSection books={trendingBooks.slice(0, 4).map((b) => ({
          slug: b.slug,
          title: b.title,
          author: b.author,
          coverUrl: b.coverUrl ?? null,
          cover: b.cover,
          department: b.department,
        }))} />
      </div>

      {/* ════════ CONTINUE READING ════════ */}
      <Suspense fallback={null}>
        <ContinueReading />
      </Suspense>

      {/* ════════ BROWSE: Trending / Recently Added + Dept chips ════════ */}
      <div className="cv-auto">
        <Suspense fallback={<BrowseBooksSkeleton />}>
          <BrowseBooksSection trendingBooks={trendingBooks} />
        </Suspense>
      </div>

      {/* ════════ TRENDING RESEARCH — top-5 theses by reader activity ════════ */}
      <div className="cv-auto">
        <Suspense fallback={<div className="h-64 animate-pulse border-b border-divider/60 bg-bg-surface" aria-hidden />}>
          <TrendingResearch />
        </Suspense>
      </div>

      {/*
        Trimmed 2026-07-06 (UX audit): the homepage previously stacked 17
        sections (~8,800px desktop / ~13,700px mobile) — scroll-depth dies
        after ~3 viewports, so sections 8+ were effectively unreachable while
        still costing data fetches. Bento, stats band, research collections,
        popular authors, recently added, catalogs, and latest posts now live
        on their own landing pages (/theses, /catalogs, /posts).
      */}

      {/* ════════ HOW TO USE — 3-step orientation ════════ */}
      <div className="cv-auto">
        <HowToUse />
      </div>

      {/* ════════ FAQ — six real front-desk questions + FAQPage schema ════════
          (JSON-LD inside stays in the HTML — content-visibility only skips
          rendering work, not markup, so the FAQPage schema is still crawled) */}
      <div className="cv-auto">
        <FaqSection />
      </div>

      {/* ════════ CTA BANNER — logged-out visitors only ════════ */}
      {!user && (
        <section className="hero-ink relative overflow-hidden">
          {/* Aurora animated gradient */}
          <div className="aurora absolute inset-0" aria-hidden />

          {/* Dot grid texture */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Center radial glow behind text */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[560px] w-[900px] rounded-full opacity-25"
            style={{ background: "radial-gradient(ellipse, rgba(37,99,235,0.55) 0%, transparent 68%)" }}
          />

          {/* Decorative open-book SVG — left edge */}
          <div aria-hidden className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 opacity-[0.045]">
            <svg width="340" height="340" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>

          {/* Decorative open-book SVG — right edge */}
          <div aria-hidden className="pointer-events-none absolute -right-10 top-1/2 -translate-y-1/2 opacity-[0.045] rotate-12">
            <svg width="340" height="340" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>

          {/* Top gold hairline */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" aria-hidden />

          <div className="relative mx-auto max-w-[1400px] px-4 py-16 sm:py-20 md:px-12 md:py-28 text-center">

            {/* Eyebrow pill badge with pulsing dot */}
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-gold-400/30 bg-gold-400/[0.09] px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
              </span>
              <span className={`text-[11px] font-bold text-gold-400 ${latinEyebrow}`}>
                {t("ctaEyebrow")}
              </span>
            </div>

            {/* Heading */}
            <h2
              className={`mx-auto max-w-3xl font-bold text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.55)] ${
                locale === "km"
                  ? "font-khmer-serif leading-[1.4] tracking-normal"
                  : "font-serif leading-[1.1] tracking-[-0.02em]"
              }`}
              style={{ fontSize: "clamp(26px, 3.6vw, 48px)" }}
            >
              {t("ctaHeading")}
            </h2>

            {/* Subtitle */}
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.75] text-blue-100/75 sm:text-[16px]">
              {t("ctaBody")}
            </p>

            {/* CTA buttons */}
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              {/* Primary — gold gradient with glow */}
              <Link
                href="/books"
                className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-b from-gold-400 to-gold-500 px-7 py-3.5 text-[15px] font-bold text-blue-950 shadow-[0_0_0_1px_rgba(228,187,48,0.35),0_8px_28px_-4px_rgba(228,187,48,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(228,187,48,0.55),0_14px_36px_-4px_rgba(228,187,48,0.55)] active:translate-y-0 sm:w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 cursor-pointer"
              >
                {t("ctaBrowse")}
                <svg
                  className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>

              {/* Secondary — glassmorphism */}
              <Link
                href="/catalogs"
                className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/20 bg-white/[0.07] px-7 py-3.5 text-[15px] font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.13] active:translate-y-0 sm:w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer"
              >
                {t("ctaPhysical")}
                <svg
                  className="h-4 w-4 opacity-60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>

            {/* Micro-stats strip — resource count comes from live stats, not a
                hardcoded claim that can drift from reality. */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {[
                { value: `${homeStats.books}+`, label: t("ctaStatResources") },
                { value: t("ctaStatFree"), label: t("ctaStatOpenAccess") },
                { value: "EN / ខ្មែរ", label: t("ctaStatBilingual") },
              ].map(({ value, label }, i) => (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <span className="hidden h-3 w-px bg-white/15 sm:block" aria-hidden />}
                  <span className="text-[14px] font-bold text-white">{value}</span>
                  <span className="text-[12px] text-blue-200/50">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom gold hairline */}
          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-400/60 to-transparent" aria-hidden />
        </section>
      )}
    </div>
  );
}
