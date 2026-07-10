// app/(public)/home/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import { preload } from "react-dom";
import { getTrendingBooksCached, getTrendingTermsCached } from "@/lib/home-data";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import { getTranslations, getLocale } from "next-intl/server";
// ── Feature components ───────────────────────────────────────────────────────
import AskLibraryHero from "@/components/ui/home/AskLibraryHero";
import HeroConstellation from "@/components/ui/home/HeroConstellation";
import ContinueReading from "@/components/ui/home/ContinueReading";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import BrowseBooksSection from "@/components/ui/home/BrowseBooksSection";
import FeaturedBooksSection from "@/components/ui/home/FeaturedBooksSection";
import FeaturedPublications from "@/components/ui/home/FeaturedPublications";
import CategoryGrid from "@/components/ui/home/CategoryGrid";
import TrendingResearch from "@/components/ui/home/TrendingResearch";
import HowToUse from "@/components/ui/home/HowToUse";
import FaqSection from "@/components/ui/home/FaqSection";
import SignupCta from "@/components/ui/home/SignupCta";
import JsonLd from "@/components/seo/JsonLd";
import { PTEC_LIBRARY_NAME, PTEC_NAME, SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";

import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Free Teaching Resources & Educational Books",
    description: "PTEC Digital Library — free textbooks, teaching resources, and research reports from Phnom Penh Teacher Education College (PTEC). Available in Khmer and English.",
    alternates: localeAlternates("/home", locale),
    openGraph: {
      title: "PTEC Digital Library — Free Teaching Resources",
      description: "Browse free textbooks, teaching materials, and research reports from Phnom Penh Teacher Education College. Available online in Khmer and English.",
      type: "website",
    },
  };
}

// ── Data fetchers ────────────────────────────────────────────────────────────
// Public list data comes from lib/home-data.ts (unstable_cache, 5-min TTL).
// Nothing on the page's critical path touches cookies — the auth check lives
// inside <SignupCta> behind Suspense, so the hero/search HTML flushes in the
// first streamed chunk instead of waiting on the Supabase auth round-trip.

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

  const [t, locale, trendingBooks, trendingTerms] = await Promise.all([
    getTranslations("home"),
    getLocale(),
    getTrendingBooksCached(),
    getTrendingTermsCached(),
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
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "EducationalOrganization",
              "@id": `${SITE_URL}/#organization`,
              name: PTEC_NAME,
              alternateName: "PTEC",
              url: SITE_URL,
              logo: `${SITE_URL}/logo.png`,
              address: {
                "@type": "PostalAddress",
                streetAddress: "St. 271, Sangkat Teuk Laork 3, Khan Toul Kork",
                addressLocality: "Phnom Penh",
                addressCountry: "KH",
              },
              contactPoint: {
                "@type": "ContactPoint",
                telephone: "+85512950192",
                contactType: "Library information",
              },
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              name: PTEC_LIBRARY_NAME,
              url: SITE_URL,
              publisher: { "@id": `${SITE_URL}/#organization` },
              potentialAction: {
                "@type": "SearchAction",
                target: `${SITE_URL}/search?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }}
      />

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

        {/* 5. Constellation canvas — client island between the background and
            the content: a drifting star network whose trending-term nodes
            light up while the search field is focused. */}
        <HeroConstellation
          terms={trendingTerms.slice(0, 4)}
          className="absolute inset-0 -z-10"
        />

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

              {/* Constellation affordance — desktop only (the canvas glow is
                  behind the left overlay and barely visible on phones) */}
              <p className="mt-3 hidden text-[12px] text-blue-300/65 lg:block">
                {t("constellationHint")}
              </p>

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

      {/* ════════ CTA BANNER — logged-out visitors only ════════
          Owns the only cookie/auth read on the page; keeping it behind
          Suspense keeps the hero out of the auth round-trip's shadow. */}
      <Suspense fallback={null}>
        <SignupCta />
      </Suspense>
    </div>
  );
}
