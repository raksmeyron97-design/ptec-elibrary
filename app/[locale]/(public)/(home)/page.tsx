// app/[locale]/(public)/(home)/page.tsx — the homepage, served at the locale
// root (/ and /km). The (home) route group exists so the homepage keeps its
// own loading/error boundaries without leaking them to sibling routes.
// Legacy /home URLs 308-redirect here in middleware.ts.
import { Suspense } from "react";
import type { Metadata } from "next";
import { preload } from "react-dom";
import { getTrendingBooksCached, getTrendingTermsCached } from "@/lib/home-data";
import { getPublishedPaths } from "@/app/actions/learning-paths";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import { getTranslations, getLocale } from "next-intl/server";
// ── Feature components ───────────────────────────────────────────────────────
import AskLibraryHero from "@/components/ui/home/AskLibraryHero";
import HeroConstellation from "@/components/ui/home/HeroConstellation";
import StartWithGoal from "@/components/ui/home/StartWithGoal";
import CollectionGrid from "@/components/ui/home/CollectionGrid";
import TrustBar from "@/components/ui/home/TrustBar";
import NewArrivals from "@/components/ui/home/NewArrivals";
import ForYouShelf from "@/components/ui/home/ForYouShelf";
import ThisWeekAtPtec from "@/components/ui/home/ThisWeekAtPtec";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import BrowseBooksSection from "@/components/ui/home/BrowseBooksSection";
import CategoryGrid from "@/components/ui/home/CategoryGrid";
import TrendingResearch from "@/components/ui/home/TrendingResearch";
import LatestPostsSection from "@/components/ui/home/LatestPostsSection";
import LibraryNow from "@/components/ui/home/LibraryNow";
import { getSiteConfig } from "@/lib/system-settings/config";
import FaqSection from "@/components/ui/home/FaqSection";
import SignupCta from "@/components/ui/home/SignupCta";
import SignedOutOnly from "@/components/ui/home/SignedOutOnly";
import ContinueReadingSwap from "@/components/ui/home/ContinueReadingSwap";
import { localeAlternates } from "@/lib/seo/alternates";
import { openGraphBase } from "@/lib/seo/open-graph";

import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";
import LatestPostsSkeleton from "@/components/ui/home/skeletons/LatestPostsSkeleton";

export const revalidate = 60;

// Hero `sizes`, deliberately UNDER-declared on phones.
//
// The honest layout answer is "100vw" — the photo is a full-bleed background.
// But `sizes` is multiplied by devicePixelRatio when the browser resolves the
// srcset, so 100vw asked a 3x phone for ~1100 px and it picked the 1440w AVIF:
// 100 KB, fetched at high priority, contending for bandwidth with the 41 KB
// render-blocking stylesheet that gates first paint. It was the single biggest
// item on the launch critical path.
//
// 320px caps every phone at the 960w variant (52 KB) — 320x3 = 960 exactly, and
// 320x2.625 = 840 rounds up to the same file. The image is decorative
// (aria-hidden, alt="") and sits under two ink gradients at 95%/85%/60% opacity,
// so the difference is not visible; the 48 KB is.
const HERO_SIZES = "(max-width: 767px) 320px, 100vw";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  // A search result and a social card reward opposite things, so they get
  // different strings rather than one doing both jobs badly.
  //
  // `seoTitle` is scanned against nine competitors in a result list, so it
  // leads with what people actually search for — free, digital library,
  // teachers, Cambodia — and carries the brand for name searches.
  //
  // `ogTitle` is usually already endorsed (someone shared the link), so
  // findability is no longer the job and the slogan can do its work. For a
  // Cambodian institution the Facebook/Telegram share is the larger share of
  // arrivals, so this is not the minor surface it looks like.
  //
  // twitter:* is set explicitly because Next falls back to the page <title>
  // otherwise, which would silently undo the split on X/Twitter cards.
  return {
    title: t("seoTitle"),
    description: t("seoDescription"),
    alternates: localeAlternates("/", locale),
    // openGraphBase carries siteName, og:locale and the reciprocal
    // og:locale:alternate. Next does NOT deep-merge `openGraph` — declaring one
    // here replaces the layout's entirely — which is exactly how this page
    // shipped with no og:site_name at all. Spread it FIRST so the ogTitle /
    // ogDescription split below still wins.
    openGraph: {
      ...(await openGraphBase(locale)),
      title: t("ogTitle"),
      description: t("ogDescription"),
      type: "website",
    },
    twitter: {
      title: t("ogTitle"),
      description: t("ogDescription"),
    },
  };
}

// ── Data fetchers ────────────────────────────────────────────────────────────
// Public list data comes from lib/home-data.ts (unstable_cache, 5-min TTL).
// NOTHING in this route may read cookies() or headers(). Suspense does not
// buy an exemption: without PPR, one cookie read anywhere in the tree makes the
// whole route render per request — which is exactly what the old
// <SignupCta>/<ForYouShelf> auth checks did. Both are now client islands fed by
// <SessionProvider>, and this page prerenders.

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  // LCP: preload the hero photo (AVIF branch — ~95% of browsers; the rest
  // simply fetch it via <picture> without the head start).
  // MUST stay byte-identical to the <source sizes> below, or the browser
  // resolves a different candidate than the one it preloaded and downloads the
  // hero twice.
  preload("/hero/ptec-library-960.avif", {
    as: "image",
    type: "image/avif",
    imageSrcSet:
      "/hero/ptec-library-640.avif 640w, /hero/ptec-library-960.avif 960w, /hero/ptec-library-1440.avif 1440w",
    imageSizes: HERO_SIZES,
    fetchPriority: "high",
  });

  const [t, locale, trendingBooks, trendingTerms, paths, siteConfig] = await Promise.all([
    getTranslations("home"),
    getLocale(),
    getTrendingBooksCached(),
    getTrendingTermsCached(),
    getPublishedPaths(),
    getSiteConfig(),
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
      {/* Institutional JSON-LD (organization / library / website @graph) is
          emitted site-wide by app/layout.tsx — do not re-declare it here. */}

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
                sizes={HERO_SIZES}
              />
              <source
                type="image/webp"
                srcSet="/hero/ptec-library-640.webp 640w, /hero/ptec-library-960.webp 960w, /hero/ptec-library-1440.webp 1440w"
                sizes={HERO_SIZES}
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
                  {t("tagline", { institution: locale === "km" ? siteConfig.name.km : siteConfig.name.en })}
                </span>
              </div>

              {/* Headline — the only element on the site that uses Koulen.
                  `font-bold` deliberately lives on the English branch rather
                  than the shared base: Koulen ships a single 400 weight, and a
                  `font-bold` it cannot satisfy makes the browser synthesise one
                  by smearing the outline, which blurs the thin connecting
                  strokes of ក ត ភ on an already-heavy display face.
                  Khmer also gets its own leading (1.3, well clear of the ~1.25
                  floor where the stacked vowel signs and the subscript ជើង of
                  "បណ្ណាល័យឌីជីថល" start to clip) and no negative tracking, which
                  would collide those subscripts with the next base glyph.
                  The slightly larger clamp compensates for Koulen being more
                  condensed than Hanuman at the same pixel size. */}
              <h1
                className={`mt-3 text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)] ${
                  locale === "km"
                    ? "font-khmer-display font-normal leading-[1.3] tracking-normal"
                    : "font-serif font-bold leading-[1.06] tracking-[-0.025em]"
                }`}
                style={{
                  fontSize:
                    locale === "km"
                      ? "clamp(34px, 4.9vw, 66px)"
                      : "clamp(32px, 4.6vw, 62px)",
                }}
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

      {/* ════════ TRUST BAR — verifiable figures, directly under the hero ════
          Deliberately NOT wrapped in .cv-auto: it sits in the initial viewport
          on most desktops, where content-visibility would defer work the
          browser is about to need anyway. Every figure comes from
          getCollectionStats(); nothing here is estimated. */}
      <TrustBar />

      {/* ════════ START WITH YOUR GOAL — task-first discovery, slot 2 ════════
          Wired to real learning paths (or curated routes); no data round-trip
          beyond the paths already fetched above, so it renders immediately. */}
      <StartWithGoal paths={paths} />

      {/* ════════ BROWSE BY COLLECTION — the four collections as equal cards ══
          Answers "what is actually in here?" immediately after <TrustBar>
          quantifies it, for the reader who cannot yet name what they want and
          so has nothing to type into the hero search. Collections and counts
          are read from the nav config and getCollectionStats() respectively —
          see the component header. */}
      <div className="cv-auto">
        <Suspense fallback={<div className="h-96 animate-pulse border-b border-divider/60 bg-bg-surface" aria-hidden />}>
          <CollectionGrid />
        </Suspense>
      </div>

      {/* Below-the-fold sections are wrapped in .cv-auto (content-visibility)
          so the browser skips their layout/paint work until scrolled near. */}

      {/* ════════ FOR YOU ════════
          The public "popular" shelf is server-rendered into the prerendered
          HTML; ContinueReadingSwap replaces it after hydration for the signed-in
          users who have reading in progress. Deciding this server-side is what
          used to make the whole homepage dynamic. */}
      <ContinueReadingSwap>
        <ForYouShelf popularBooks={trendingBooks} />
      </ContinueReadingSwap>

      {/* ════════ THIS WEEK AT PTEC — one editorial band ════════
          Editor's pick + publication + learning path + news, replacing the two
          old repetitive "featured" sections. Editor's pick excludes the hero
          books so nothing appears twice above the fold. */}
      <div className="cv-auto">
        <Suspense fallback={<div className="h-80 animate-pulse border-b border-divider/60 bg-bg-surface" aria-hidden />}>
          <ThisWeekAtPtec paths={paths} excludeSlugs={heroBooks.map((b) => b.slug)} />
        </Suspense>
      </div>

      {/* ════════ COLLECTION PREVIEW — ≤8 cards, 4-per-row ════════ */}
      <div className="cv-auto">
        <Suspense fallback={<BrowseBooksSkeleton />}>
          <BrowseBooksSection trendingBooks={trendingBooks} />
        </Suspense>
      </div>

      {/* ════════ BROWSE BY SUBJECT ════════ */}
      <div className="cv-auto">
        <Suspense fallback={<div className="h-48 animate-pulse border-b border-divider/60 bg-paper" aria-hidden />}>
          <CategoryGrid />
        </Suspense>
      </div>

      {/* ════════ NEW THIS WEEK — chronological, across all three types ══════
          Complements <ThisWeekAtPtec> above rather than repeating it: that
          band is curated, this one is simply "what arrived most recently". */}
      <div className="cv-auto">
        <Suspense fallback={<div className="h-72 animate-pulse border-b border-divider/60 bg-bg-surface" aria-hidden />}>
          <NewArrivals />
        </Suspense>
      </div>

      {/* ════════ TRENDING RESEARCH — top-5 theses by reader activity ════════ */}
      <div className="cv-auto">
        <Suspense fallback={<div className="h-64 animate-pulse border-b border-divider/60 bg-bg-surface" aria-hidden />}>
          <TrendingResearch />
        </Suspense>
      </div>

      {/* ════════ NEWS & EVENTS ════════
          <ThisWeekAtPtec> above carries a single editorial post inside a mixed
          band; this is the actual news section — a featured post plus three
          more, with its own "view all posts" exit to /posts. The component and
          its skeleton already existed and were simply never mounted. */}
      <div className="cv-auto">
        <Suspense fallback={<LatestPostsSkeleton />}>
          <LatestPostsSection />
        </Suspense>
      </div>

      {/* ════════ LIBRARY NOW — digital ↔ physical bridge (live open/closed) ════════ */}
      <div className="cv-auto">
        <LibraryNow
          openingHoursSpec={[...siteConfig.hours.openingHoursSpec]}
          closures={siteConfig.hours.closures}
          mapPlaceUrl={siteConfig.links.mapPlace}
        />
      </div>

      {/* ════════ FAQ — six real front-desk questions + FAQPage schema ════════
          (JSON-LD inside stays in the HTML — content-visibility only skips
          rendering work, not markup, so the FAQPage schema is still crawled) */}
      <div className="cv-auto">
        <FaqSection />
      </div>

      {/* ════════ CTA BANNER — logged-out visitors only ════════
          Public content; hidden client-side for signed-in users rather than
          gated on a server auth read (which would make this page dynamic). */}
      <SignedOutOnly>
        <SignupCta />
      </SignedOutOnly>
    </div>
  );
}
