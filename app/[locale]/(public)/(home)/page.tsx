// app/[locale]/(public)/(home)/page.tsx — the homepage, served at the locale
// root (/ and /km). The (home) route group exists so the homepage keeps its
// own loading/error boundaries without leaking them to sibling routes.
// Legacy /home URLs 308-redirect here in middleware.ts.
import { Suspense } from "react";
import type { Metadata } from "next";
import { preload } from "react-dom";
import { getTrendingBooksCached, getTrendingTermsCached } from "@/lib/home-data";
import { toBookCardList } from "@/lib/books/card-data";
import { getPublishedPaths } from "@/app/actions/learning-paths";
import { getHomepagePhotos } from "@/lib/homepage-photos";
import { getTranslations, setRequestLocale } from "next-intl/server";
// ── Feature components ───────────────────────────────────────────────────────
import AskLibraryHero from "@/components/ui/home/AskLibraryHero";
import HeroConstellation from "@/components/ui/home/HeroConstellation";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import QuickAccessRow from "@/components/ui/home/QuickAccessRow";
import TrustBar from "@/components/ui/home/TrustBar";
import BrowseBooksSection from "@/components/ui/home/BrowseBooksSection";
import StartHere from "@/components/ui/home/StartHere";
import LatestPostsSection from "@/components/ui/home/LatestPostsSection";
import LibraryNow from "@/components/ui/home/LibraryNow";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import FaqSection, { homeFaqNode } from "@/components/ui/home/FaqSection";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";

import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";
import LatestPostsSkeleton from "@/components/ui/home/skeletons/LatestPostsSkeleton";
import PageJsonLd from "@/components/seo/PageJsonLd";

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
  const [t, org] = await Promise.all([
    getTranslations({ locale, namespace: "home" }),
    getOrgIdentity(),
  ]);
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
  // otherwise, which would silently undo the split on X/Twitter cards. It goes
  // through buildTwitter() for a second reason found on production
  // 2026-09-20: this block declared `{ title, description }` with no `card`,
  // and `twitter` is replaced wholesale exactly like `openGraph`, so it
  // overwrote the root layout's `summary_large_image`. The site's most-shared
  // URL was publishing its 1200 x 630 landscape card as `twitter:card =
  // summary` — a small square crop — on / and /km alike.
  //
  // One object, used for both `alternates.canonical` and `openGraph.url`.
  const alternates = localeAlternates("/", locale);
  const openGraph = buildOpenGraph({
    locale,
    org,
    title: t("ogTitle"),
    description: t("ogDescription"),
    type: "website" as const,
    url: alternates.canonical,
  });
  return {
    title: t("seoTitle"),
    description: t("seoDescription"),
    alternates,
    openGraph,
    twitter: buildTwitter({
      card: "summary_large_image",
      title: t("ogTitle"),
      description: t("ogDescription"),
      images: openGraph.images,
    }),
  };
}

// ── Data fetchers ────────────────────────────────────────────────────────────
// Public list data comes from lib/home-data.ts (unstable_cache, 5-min TTL).
// NOTHING in this route may read cookies() or headers(). Suspense does not
// buy an exemption: without PPR, one cookie read anywhere in the tree makes the
// whole route render per request — which is exactly what the old sign-up
// banner and For-you shelf auth checks did. Everything per-reader is now a
// client island fed by <SessionProvider> (<SignedOutOnly> around the FAQ's
// sign-up card, <ContinueReadingStrip> above the shelf), and this page
// prerenders.

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  // The locale comes from the route, and next-intl is told it here, in the
  // page itself. Without this, getTranslations()/getLocale() fall back to
  // reading request headers whenever the layout's setRequestLocale() has not
  // reached this segment — a dynamic API that turned the whole homepage into
  // a per-request render once the route-level loading boundary was removed
  // (SEO Phase 1, D9). next-intl's static-rendering rule: every page that
  // reads translations on the server calls setRequestLocale().
  const { locale } = await params;
  setRequestLocale(locale);

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

  const [t, trendingBooks, trendingTerms, paths, siteConfig] = await Promise.all([
    getTranslations({ locale, namespace: "home" }),
    getTrendingBooksCached(),
    getTrendingTermsCached(),
    getPublishedPaths(),
    getSiteConfig(),
  ]);

  // Admin-managed gallery (/admin/homepage-photos). The Visit band shows
  // ONE photograph — the first in the admin's order — and falls back to the
  // building when the gallery is empty.
  const galleryPhotos = await getHomepagePhotos(locale);

  const heroBooks = trendingBooks.slice(0, 8).map((b) => ({
    slug: b.slug,
    title: b.title,
    author: b.author,
    coverUrl: b.coverUrl ?? null,
    coverColor: b.cover,
    department: b.department,
  }));

  // The shelf's covers are client components, so this is the homepage's
  // serialisation boundary: `trendingBooks` is a full `Book[]`, and the card
  // type keeps only the fields a card may draw.
  const trendingCards = toBookCardList(trendingBooks);

  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.22em]" : "tracking-normal";

  return (
    <div className="min-h-screen bg-paper">
      {/* The page's one JSON-LD document (SEO Phase 4): the college, library
          and website nodes, plus the FAQ below, which is read from the same
          strings as the visible accordion. */}
      <PageJsonLd nodes={[await homeFaqNode(locale)]} />

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
                  hintKeyboard={t("askHintKeyboard")}
                />
              </div>

              {/* Quick access — phones only. Search, then the collections it
                  searches, one swipe away, before any shelf. */}
              <div className="mt-6 lg:hidden">
                <QuickAccessRow />
              </div>

              {/* Constellation affordance — desktop only (the canvas glow is
                  behind the left overlay and barely visible on phones) */}
              <p className="mt-3 hidden text-[12px] text-blue-300/65 lg:block">
                {t("constellationHint")}
              </p>

              {/* Mobile book strip — unchanged component. Its own root already
                  carries mt-9; the old mt-10 here stacked 76px of empty ink
                  above the "Featured" label. */}
              <div className="mt-1 lg:hidden">
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
                <HeroBookStack
                  books={heroBooks}
                  labels={{ browseAll: t("ctaBrowse"), mostDownloaded: t("heroMostDownloaded") }}
                />
              </div>
            </div>

          </div>
        </div>

        {/* Gold seam at the bottom of the hero */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-400/80 to-transparent" />
      </section>

      {/* ════════ THE ORDER BELOW THE HERO ════════════════════════════════
          The hero above is the ORIGINAL one, kept as it was by the owner's
          choice (2026-10-03): photograph, constellation, rotating book stack,
          and the figures band directly under it. Below it, the redesigned
          bands:

          1. Start here  — what is in the library beside what you came to do.
          2. Browse      — ONE shelf: Trending · Recently Added · Theses.
          3. News        — the newest posts, beside the contribution card.
          4. Visit       — the library's status and hours, one photograph.
          5. FAQ         — the front desk's questions, with the sign-up card.

          Grounds alternate paper / surface and every card wears the opposite
          ground, so a card is never invisible on its own band. Each band
          declares its own `surface` (see HomeSection.tsx). */}

      {/* ════════ TRUST BAR — verifiable figures, directly under the hero ════
          Deliberately NOT wrapped in .cv-auto: it sits in the initial viewport
          on most desktops, where content-visibility would defer work the
          browser is about to need anyway. Every figure comes from
          getCollectionStats(); nothing here is estimated. */}
      <TrustBar />

      {/* Below-the-fold sections are wrapped in .cv-auto (content-visibility)
          so the browser skips their layout/paint work until scrolled near.
          Each reserves roughly its real height (--cv-reserve, phone / lg):
          measured on production 2026-09-24 at 412px and 1350px and rounded
          up ~10%. A reservation SMALLER than the section is not harmless —
          see .cv-auto in globals.css — so when a section grows, raise its
          number rather than trimming it. */}

      {/* ════════ START HERE — collections (7/12) beside goals (5/12) ════════
          Collections are read from the nav config, counts from
          getCollectionStats(), goals from the published learning paths
          already fetched above. Replaces three bands: Start with your goal,
          Browse by Collection and Browse by Subject. */}
      <div className="cv-auto [--cv-reserve:1500px] lg:[--cv-reserve:780px]">
        <Suspense fallback={<div className="h-[780px] animate-pulse border-b border-divider/60 bg-paper" aria-hidden />}>
          <StartHere paths={paths} />
        </Suspense>
      </div>

      {/* ════════ BROWSE THE COLLECTION — the one shelf ════════
          Trending · Recently Added · Theses, ≤ 6 each, plus a Continue-reading
          strip for signed-in readers (a client island; the shelf itself is
          identical for everyone and stays prerendered). It replaces four
          bands that showed overlapping sets of the same books. */}
      <div className="cv-auto [--cv-reserve:900px] lg:[--cv-reserve:1020px]">
        <Suspense fallback={<BrowseBooksSkeleton />}>
          <BrowseBooksSection trendingBooks={trendingCards} />
        </Suspense>
      </div>

      {/* ════════ NEWS & CONTRIBUTE ════════
          The newest post as a feature card plus up to three rows (8/12),
          beside the contribution card on the plate (4/12, id="contribute").
          With no posts, the contribution card takes the band. */}
      <div className="cv-auto [--cv-reserve:1360px] lg:[--cv-reserve:880px]">
        <Suspense fallback={<LatestPostsSkeleton />}>
          <LatestPostsSection />
        </Suspense>
      </div>

      {/* ════════ VISIT — e-library + physical library status and hours, one photo ════════ */}
      <div className="cv-auto [--cv-reserve:1400px] lg:[--cv-reserve:940px]">
        <LibraryNow
          openingHoursSpec={[...siteConfig.hours.openingHoursSpec]}
          closures={siteConfig.hours.closures}
          mapPlaceUrl={siteConfig.links.mapPlace}
          photo={galleryPhotos[0] ?? null}
        />
      </div>

      {/* ════════ FAQ — six real front-desk questions + FAQPage schema, with the
          sign-up card (signed-out only) in its left column ════════
          (JSON-LD inside stays in the HTML — content-visibility only skips
          rendering work, not markup, so the FAQPage schema is still crawled) */}
      <div className="cv-auto [--cv-reserve:1110px] lg:[--cv-reserve:660px]">
        <FaqSection />
      </div>
    </div>
  );
}
