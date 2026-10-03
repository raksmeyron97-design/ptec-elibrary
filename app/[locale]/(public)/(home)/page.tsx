// app/[locale]/(public)/(home)/page.tsx — the homepage, served at the locale
// root (/ and /km). The (home) route group exists so the homepage keeps its
// own loading/error boundaries without leaking them to sibling routes.
// Legacy /home URLs 308-redirect here in middleware.ts.
import { Suspense } from "react";
import type { Metadata } from "next";
import { getTrendingBooksCached, getTrendingTermsCached } from "@/lib/home-data";
import { toBookCardList } from "@/lib/books/card-data";
import { getPublishedPaths } from "@/app/actions/learning-paths";
import { getHomepagePhotos } from "@/lib/homepage-photos";
import { getTranslations, setRequestLocale } from "next-intl/server";
// ── Feature components ───────────────────────────────────────────────────────
import AskLibraryHero from "@/components/ui/home/AskLibraryHero";
import StartWithGoal from "@/components/ui/home/StartWithGoal";
import CollectionGrid from "@/components/ui/home/CollectionGrid";
import TrustBar from "@/components/ui/home/TrustBar";
import GrowTheCollection from "@/components/ui/home/GrowTheCollection";
import BrowseBooksSection from "@/components/ui/home/BrowseBooksSection";
import CategoryGrid from "@/components/ui/home/CategoryGrid";
import LatestPostsSection from "@/components/ui/home/LatestPostsSection";
import LibraryNow from "@/components/ui/home/LibraryNow";
import HeroPhotoGallery, { HERO_PHOTO_COUNT } from "@/components/ui/home/HeroPhotoGallery";
import NarrativeCards, { NARRATIVE_PHOTO_COUNT } from "@/components/ui/home/NarrativeCards";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import FaqSection, { homeFaqNode } from "@/components/ui/home/FaqSection";
import SignupCta from "@/components/ui/home/SignupCta";
import SignedOutOnly from "@/components/ui/home/SignedOutOnly";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";

import BrowseBooksSkeleton from "@/components/ui/home/skeletons/BrowseBooksSkeleton";
import LatestPostsSkeleton from "@/components/ui/home/skeletons/LatestPostsSkeleton";
import PageJsonLd from "@/components/seo/PageJsonLd";

export const revalidate = 60;

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
// whole route render per request — which is exactly what the old
// <SignupCta>/<ForYouShelf> auth checks did. Both are now client islands fed by
// <SessionProvider>, and this page prerenders.

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

  const [t, trendingBooks, trendingTerms, paths, siteConfig] = await Promise.all([
    getTranslations({ locale, namespace: "home" }),
    getTrendingBooksCached(),
    getTrendingTermsCached(),
    getPublishedPaths(),
    getSiteConfig(),
  ]);

  // Admin-managed gallery (/admin/homepage-photos). One fetch, sliced by
  // position: the first three photos build the mosaic, the next three the
  // narrative cards. Both components return null when their slice is short,
  // so an empty or partly-filled gallery simply removes its own section.
  const galleryPhotos = await getHomepagePhotos(locale);
  const mosaicPhotos = galleryPhotos.slice(0, HERO_PHOTO_COUNT);
  const narrativePhotos = galleryPhotos.slice(
    HERO_PHOTO_COUNT,
    HERO_PHOTO_COUNT + NARRATIVE_PHOTO_COUNT,
  );

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

      {/* ════════ HERO ════════
          The plate, the headline, one search bar. No photograph, canvas or
          rotating book stack: the H1 is the largest thing painted, so it is
          the LCP element and nothing has to be fetched before the page reads.
          The building photo moved to the Visit band, where it is about the
          place rather than decoration behind the search box. */}
      <section className="relative isolate z-40 overflow-clip bg-plate text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_90%_at_88%_-10%,rgba(58,95,196,.32),transparent_62%),linear-gradient(180deg,transparent_35%,#060B1A_140%)]"
        />
        <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-4 pb-8 pt-9 sm:px-8 sm:py-16 md:px-12 lg:grid-cols-[1.12fr_.88fr] lg:pb-20 lg:pt-24">
          <div className="hero-stagger min-w-0">
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

            <p className="mt-4 max-w-[34em] text-[16px] leading-[1.65] text-blue-100 md:text-[18px]">
              {t("description")}
            </p>

            <div className="relative z-50 mt-8 max-w-[640px]">
              <AskLibraryHero
                trending={trendingTerms.slice(0, 5)}
                prompts={[t("prompt1"), t("prompt2"), t("prompt3")]}
                askLabel={t("searchButton")}
                hintKeyboard={t("askHintKeyboard")}
              />
            </div>

            {/* The three verified figures — the TrustBar band, folded into
                the hero. Every number is getCollectionStats(), floors and all. */}
            <TrustBar variant="hero" />
          </div>

          {/* Desktop column for the cover fan (Phase 2). Empty until then. */}
          <div className="hidden lg:block" aria-hidden />
        </div>

        {/* Gold seam at the bottom of the hero */}
        <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-gold-400/80 to-transparent" />
      </section>

      {/* ════════ THE ORDER BELOW THE HERO ════════════════════════════════
          Three passes over one question: what does a reader who just landed
          need next?

          1. ORIENT — the hero's figures (how big is this?), StartWithGoal (what am I
             here to do?), CollectionGrid (what is in it?).
          2. DISCOVER — the shelves, in decreasing generality: popular, the
             full tabbed browse, by subject, newest, most-read research.
          3. ACT / VISIT — contribute, read the news, see the place, come in,
             ask a question, sign up.

          Two moves against the previous order, both measured on a 375 px
          phone against the live site:

          • The photo gallery LEFT slot 2. It put 876 px of photographs
            between the search box and the first book cover, so the first
            cover sat five screens down. It now introduces <NarrativeCards>
            and <LibraryNow> — the bands about the physical library — which
            is the subject the photographs are actually about.
          • <GrowTheCollection> MOVED AFTER discovery. "Tell us what's
            missing" is a question for a reader who has just looked and not
            found it, not for one who has seen nothing yet.

          Backgrounds alternate paper / surface down the page and every card
          wears the opposite ground, so a card is never invisible on its own
          band. Each band declares its own `surface` (see HomeSection.tsx)
          because the optional bands hide themselves and the page cannot know
          at render time which neighbours survive; where one does hide, two
          same-coloured bands meet and their divider still separates them. */}

      {/* ════════ START WITH YOUR GOAL — task-first discovery ════════════════
          Wired to real learning paths (or curated routes); no data round-trip
          beyond the paths already fetched above, so it renders immediately. */}
      <StartWithGoal paths={paths} />

      {/* Below-the-fold sections are wrapped in .cv-auto (content-visibility)
          so the browser skips their layout/paint work until scrolled near.
          Each reserves roughly its real height (--cv-reserve, phone / lg):
          measured on production 2026-09-24 at 412px and 1350px and rounded
          up ~10%. A reservation SMALLER than the section is not harmless —
          see .cv-auto in globals.css — so when a section grows, raise its
          number rather than trimming it. */}

      {/* ════════ BROWSE BY COLLECTION — the four collections as equal cards ══
          Answers "what is actually in here?" for the reader who cannot yet
          name what they want and so has nothing to type into the hero search.
          Collections and counts are read from the nav config and
          getCollectionStats() respectively — see the component header. */}
      <div className="cv-auto [--cv-reserve:1000px] lg:[--cv-reserve:560px]">
        <Suspense fallback={<div className="h-96 animate-pulse border-b border-divider/60 bg-paper" aria-hidden />}>
          <CollectionGrid />
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

      {/* ════════ BROWSE BY SUBJECT ════════ */}
      <div className="cv-auto [--cv-reserve:580px] lg:[--cv-reserve:600px]">
        <Suspense fallback={<div className="h-48 animate-pulse border-b border-divider/60 bg-bg-surface" aria-hidden />}>
          <CategoryGrid />
        </Suspense>
      </div>

      {/* ════════ GROW THE COLLECTION — the contribution band ════════
          Replaces "This week at PTEC" / "New and noteworthy", which was a fifth
          view of the same handful of books the shelves above already showed
          (audit: 32 resource links on this page resolved to 16 unique items).
          This slot ASKS rather than displays, because the collection's real
          constraint is its size. Both doors land in the existing
          /admin/book-requests queue via the `kind` column from migration 0119. */}
      <div className="cv-auto [--cv-reserve:1000px] lg:[--cv-reserve:680px]">
        <Suspense fallback={<div className="h-80 animate-pulse border-b border-divider/60 bg-paper" aria-hidden />}>
          <GrowTheCollection />
        </Suspense>
      </div>

      {/* ════════ NEWS & EVENTS ════════
          The site's only news band now that <ThisWeekAtPtec> is gone — a
          featured post plus three more, with its own "view all posts" exit to
          /posts. */}
      <div className="cv-auto [--cv-reserve:1300px] lg:[--cv-reserve:1060px]">
        <Suspense fallback={<LatestPostsSkeleton />}>
          <LatestPostsSection />
        </Suspense>
      </div>

      {/* ════════ LIFE AT THE LIBRARY — admin-managed photo mosaic ════════
          Editorial, not decorative: it answers "is this place actually used?"
          Content comes from /admin/homepage-photos, so a new term's photos
          need no deploy. The section removes itself entirely when no photos
          are active. Together with <NarrativeCards> below it, it introduces
          <LibraryNow> — these are photographs of the room that section is
          inviting the reader into. */}
      <div className="cv-auto [--cv-reserve:1000px] lg:[--cv-reserve:650px]">
        <HeroPhotoGallery photos={mosaicPhotos} totalCount={galleryPhotos.length} />
      </div>

      {/* ════════ FOCUS / DISCOVER / CONNECT — the gallery's second half ════
          Needs all three slots filled or it renders nothing. */}
      <div className="cv-auto [--cv-reserve:1000px] lg:[--cv-reserve:700px]">
        <NarrativeCards photos={narrativePhotos} />
      </div>

      {/* ════════ LIBRARY NOW — digital ↔ physical bridge (live open/closed) ════════ */}
      <div className="cv-auto [--cv-reserve:920px] lg:[--cv-reserve:620px]">
        <LibraryNow
          openingHoursSpec={[...siteConfig.hours.openingHoursSpec]}
          closures={siteConfig.hours.closures}
          mapPlaceUrl={siteConfig.links.mapPlace}
        />
      </div>

      {/* ════════ FAQ — six real front-desk questions + FAQPage schema ════════
          (JSON-LD inside stays in the HTML — content-visibility only skips
          rendering work, not markup, so the FAQPage schema is still crawled) */}
      <div className="cv-auto [--cv-reserve:760px] lg:[--cv-reserve:560px]">
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
