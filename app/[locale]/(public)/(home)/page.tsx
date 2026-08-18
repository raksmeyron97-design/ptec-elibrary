// app/[locale]/(public)/(home)/page.tsx — the homepage, served at the locale
// root (/ and /km). The (home) route group exists so the homepage keeps its
// own loading/error boundaries without leaking them to sibling routes.
// Legacy /home URLs 308-redirect here in middleware.ts.
//
// ── Eight sections, in this order, and why ───────────────────────────────────
//
//   1. Hero          headline + scoped search + trust points + stat strip
//   2. Start with your goal
//   3. Featured from the collection
//   4. Browse by subject
//   5. Read online, or visit us
//   6. News & new arrivals
//   7. FAQ
//   8. Closing CTA
//
// This replaced eleven bands that between them showed the same 114-item
// collection five times over: /books/pisa-d appeared four times on one page,
// two stats blocks six sections apart labelled the same figures differently,
// and a tabbed "Browse the Collection" grid sat directly above a "Browse by
// Subject" grid offering the same taxonomy.
//
// Nothing was dropped in the merge. The retired bands' capabilities went:
//   • "PTEC Library at a glance" + "PTEC Library in numbers" → <HeroStatStrip>,
//     now the page's only statistics surface (physical copies moved to §5,
//     where a reader can act on them).
//   • "Popular with PTEC students" + "Featured" + "Browse the Collection"'s
//     Trending tab + "New and noteworthy"'s editor's pick → §3.
//   • "Browse the Collection"'s Recently Added tab + "Just added" → §6.
//   • "Browse the Collection"'s per-department tabs → §4's subject tiles, which
//     land on the same /books?dept= filters.
//   • "Trending Research" → §3, where the thesis holds a reserved slot. That
//     section rendered nothing in production anyway: it hides below three
//     theses and the library has one.
//   • The mid-page "sign in free" strip → §8's optional sign-in offer.
//
// ── Two rules this file must keep ───────────────────────────────────────────
//
// NOTHING in this route may read cookies() or headers(). Suspense does not buy
// an exemption: without PPR, one cookie read anywhere in the tree makes the
// whole route render per request — which is exactly what the old
// <SignupCta>/<ForYouShelf> auth checks did. Per-user behaviour lives in client
// islands fed by <SessionProvider>, and this page prerenders.
//
// No section fetches for itself. All data comes from getHomePayload(), which
// composes it through one exclusion set so no resource can appear twice.
import type { Metadata } from "next";
import { preload } from "react-dom";
import HeroBookStack from "@/components/ui/home/HeroBookStack";
import { getTranslations, getLocale } from "next-intl/server";
import { getHomePayload } from "@/lib/home/payload";
// ── Feature components ───────────────────────────────────────────────────────
import AskLibraryHero from "@/components/ui/home/AskLibraryHero";
import HeroConstellation from "@/components/ui/home/HeroConstellation";
import HeroTrustPoints from "@/components/ui/home/HeroTrustPoints";
import HeroStatStrip from "@/components/ui/home/HeroStatStrip";
import StartWithGoal from "@/components/ui/home/StartWithGoal";
import FeaturedCollection from "@/components/ui/home/FeaturedCollection";
import CategoryGrid from "@/components/ui/home/CategoryGrid";
import NewsAndArrivals from "@/components/ui/home/NewsAndArrivals";
import MobileFeaturedStrip from "@/components/ui/home/MobileFeaturedStrip";
import LibraryNow from "@/components/ui/home/LibraryNow";
import { getSiteConfig } from "@/lib/system-settings/config";
import FaqSection from "@/components/ui/home/FaqSection";
import SignupCta from "@/components/ui/home/SignupCta";
import ContinueReadingSwap from "@/components/ui/home/ContinueReadingSwap";
import { sectionSurface } from "@/components/ui/home/SectionHeader";
import { localeAlternates } from "@/lib/seo/alternates";

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
  return {
    title: t("seoTitle"),
    description: t("seoDescription"),
    alternates: localeAlternates("/", locale),
    openGraph: {
      title: t("seoTitle"),
      description: t("seoDescription"),
      type: "website",
      // Reciprocal locale signals — the page exists in both, and og:locale
      // alone would tell a share preview only about the one it fetched.
      locale: locale === "km" ? "km_KH" : "en_US",
      alternateLocale: locale === "km" ? "en_US" : "km_KH",
      images: ["/og-default.png"],
    },
  };
}

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

  const locale = await getLocale();
  const [t, payload, siteConfig] = await Promise.all([
    getTranslations("home"),
    getHomePayload(locale),
    getSiteConfig(),
  ]);

  const heroBooks = payload.heroBooks.map((b) => ({
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
          emitted site-wide by components/layout/RootShell.tsx — do not
          re-declare it here. §3 adds an ItemList for the featured set, which is
          a different entity and does not conflict. */}

      {/* ════════ 1. HERO ════════
          Absorbs the two old statistics bands. Everything a stranger needs to
          decide whether this library is for them — that it is free, needs no
          account, and is bilingual — is inside this section, above the fold.
          It used to be reachable only inside a collapsed FAQ nine sections
          down. */}
      <section className="hero-ink relative isolate z-40 text-white" aria-labelledby="hero-title">

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
        </div>

        {/* 5. Constellation canvas — client island between the background and
            the content: a drifting star network whose trending-term nodes
            light up while the search field is focused. */}
        <HeroConstellation
          terms={payload.trendingTerms.slice(0, 4)}
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
                  condensed than Hanuman at the same pixel size.

                  The copy itself leads with PUBLIC ACCESS. It used to read
                  "The Digital Library for the Next Generation of Teachers",
                  which addresses trainee teachers — the one audience that
                  already knows about the library. The teacher-education
                  specialism is now the subhead, where it describes the
                  collection rather than gating it. */}
              <h1
                id="hero-title"
                className={`mt-3 text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)] ${
                  locale === "km"
                    ? "font-khmer-display font-normal leading-[1.3] tracking-normal"
                    : "font-serif font-bold leading-[1.06] tracking-[-0.025em]"
                }`}
                style={{
                  fontSize:
                    locale === "km"
                      ? "clamp(30px, 4.4vw, 60px)"
                      : "clamp(32px, 4.6vw, 62px)",
                }}
              >
                {t("headline")}
              </h1>

              {/* Description */}
              <p
                className="mt-4 max-w-lg text-[15px] text-blue-100/90 md:text-[16px]"
                style={{ lineHeight: locale === "km" ? 1.9 : 1.7 }}
              >
                {t("description")}
              </p>

              {/* Ask bar */}
              <div className="relative z-50 mt-8 max-w-xl">
                <AskLibraryHero
                  trending={payload.trendingTerms}
                  prompts={[t("prompt1"), t("prompt2"), t("prompt3")]}
                  askLabel={t("searchButton")}
                  hint={t("askHint")}
                />
              </div>

              {/* Trust points — directly under the search box, per the brief.
                  Three non-numeric facts; the figures are the strip below. */}
              <HeroTrustPoints
                points={[t("trustFree"), t("trustNoAccount"), t("trustBilingual")]}
              />

              {/* The page's only statistics surface. */}
              <HeroStatStrip
                stats={payload.stats}
                locale={locale}
                resourcesLabel={t("statDigitalResources")}
                subjectsLabel={t("statSubjects")}
                sinceLabel={t("statSinceLabel")}
              />

              {/* Constellation affordance — desktop only (the canvas glow is
                  behind the left overlay and barely visible on phones) */}
              <p className="mt-4 hidden text-[12px] text-blue-300/65 lg:block">
                {t("constellationHint")}
              </p>

              {/* Mobile book strip */}
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

      {/* ════════ 2. START WITH YOUR GOAL ════════
          Task-first discovery. Every card resolves through lib/home/goals.ts,
          which matches on a path's NAME fields and lets no two goals claim the
          same path — the rule that fixes the two production mislinks.
          Deliberately NOT wrapped in .cv-auto: it sits in the initial viewport
          on most desktops, where content-visibility would defer work the
          browser is about to need anyway. */}
      <StartWithGoal paths={payload.paths} surfaceClass={sectionSurface(0)} />

      {/* Below-the-fold sections are wrapped in .cv-auto (content-visibility)
          so the browser skips their layout/paint work until scrolled near. */}

      {/* ════════ 3. FEATURED ════════
          One de-duplicated set of eight, mixed across books, the thesis and the
          publication. <ContinueReadingSwap> replaces it after hydration for the
          signed-in minority who have reading in progress — deciding that
          server-side is what used to make the whole homepage dynamic. */}
      <div className="cv-auto">
        <ContinueReadingSwap>
          <FeaturedCollection items={payload.featured} surfaceClass={sectionSurface(1)} />
        </ContinueReadingSwap>
      </div>

      {/* ════════ 4. BROWSE BY SUBJECT ════════ */}
      <div className="cv-auto">
        <CategoryGrid departments={payload.subjects} surfaceClass={sectionSurface(2)} />
      </div>

      {/* ════════ 5. READ ONLINE, OR VISIT US ════════
          Live open/closed status computed in Cambodia time, plus the physical
          collection figure — which is the one place on the page a reader can
          act on it. */}
      <div className="cv-auto">
        <LibraryNow
          openingHoursSpec={[...siteConfig.hours.openingHoursSpec]}
          closures={siteConfig.hours.closures}
          mapPlaceUrl={siteConfig.links.mapPlace}
          physicalCatalogs={payload.stats?.physicalCatalogs}
          surfaceClass={sectionSurface(3)}
        />
      </div>

      {/* ════════ 6. NEWS & NEW ARRIVALS ════════ */}
      <div className="cv-auto">
        <NewsAndArrivals
          posts={payload.posts}
          arrivals={payload.arrivals}
          surfaceClass={sectionSurface(4)}
        />
      </div>

      {/* ════════ 7. FAQ ════════
          Five questions, ordered for a stranger. FAQPage JSON-LD is generated
          from the same strings, so the schema always mirrors the visible text.
          (content-visibility skips rendering work, not markup, so the schema is
          still crawled.) */}
      <div className="cv-auto">
        <FaqSection surfaceClass={sectionSurface(5)} />
      </div>

      {/* ════════ 8. CLOSING CTA ════════
          Browse-first, not a sign-in wall. Always rendered; only the optional
          sign-in offer inside it is hidden for signed-in users. */}
      <SignupCta />
    </div>
  );
}
