// components/ui/home/HeroPhotoGallery.tsx
// "Life at the library" — a split band pairing one line of copy with a photo
// grid drawn from the admin-managed gallery (migration 0118,
// /admin/homepage-photos).
//
// It sits in the page's second half, beside the physical-library bridge, and
// is deliberately not the hero itself: the hero
// background is the LCP element and is served from pre-generated local
// variants (public/hero/*) that can be preloaded at build time. An
// admin-uploadable remote URL cannot be, so promoting these photos into the
// hero would trade a measured 1.98 s FCP for an unbounded one.
//
// It used to sit directly under the trust bar, ahead of every band that shows
// a book: on a 375 px phone that put 876 px of photographs between the search
// box and the first cover, and the first cover five screens down. Photos of
// the reading room introduce the section about VISITING it, so they lead
// into <NarrativeCards> and <LibraryNow> instead — which is why the primary
// action here is "Visit us" (an in-page jump to <LibraryNow>'s hours and
// directions) and browsing the collection is the secondary one.
//
// The photos are a grid, not an overlapping collage. The collage it replaces
// laid two framed photos over the main one, and with reading-room shots the
// part they covered was the people — the only thing the section is about.
// Every tile now shows its whole crop, edges align with the copy column, and
// an editor's caption is visible at every width rather than on phones only.
//
// Renders nothing when the gallery is empty — an empty photo frame says less
// about the library than no section at all.
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { ArrowRight, MapPin, Quote } from "lucide-react";
import type { PublicHomepagePhoto } from "@/lib/types/homepage-photo";
import { HomeSection, SectionHeader, LIBRARY_NOW_ANCHOR } from "./HomeSection";

/** Photos consumed by the grid. The next three feed <NarrativeCards>.
 *  Mirrors HERO_SLOTS in the admin grid. */
export const HERO_PHOTO_COUNT = 3;

/**
 * Per-slot `sizes`, from the grid's geometry: the photo column is 3/5 of a
 * container that stops growing at 1400px (1304px of content at md padding),
 * split 1.6fr / 1fr with a 16px gap. So at ≥1440 the lead tile is ~470px and
 * each side tile ~290px; below lg the grid is full width, lead on its own row
 * and the side tiles sharing the next one.
 *
 * Each arm caps in px past 1440 for the same reason the collage's did — a
 * bare vw tail keeps inflating after the slot stops growing.
 */
const SIZES = {
  lead: "(max-width: 1023px) 100vw, (max-width: 1440px) 34vw, 480px",
  side: "(max-width: 1023px) 50vw, (max-width: 1440px) 21vw, 300px",
  // With two photos the second stands beside the lead at full height.
  pair: "(max-width: 1023px) 100vw, (max-width: 1440px) 21vw, 300px",
  // A single photo takes the whole column.
  solo: "(max-width: 1023px) 100vw, (max-width: 1440px) 56vw, 800px",
} as const;

function Tile({
  photo,
  sizes,
  className,
}: {
  photo: PublicHomepagePhoto;
  sizes: string;
  className: string;
}) {
  return (
    <figure className={`group relative m-0 overflow-hidden rounded-2xl bg-bg-surface shadow-sm ring-1 ring-divider/60 ${className}`}>
      <Image
        src={photo.url}
        alt={photo.alt}
        fill
        sizes={sizes}
        quality={75}
        // motion-safe: the zoom is decorative, and a reader who asked their
        // OS for reduced motion does not get it.
        className="object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out motion-safe:group-hover:scale-[1.04]"
        {...(photo.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: photo.blurDataUrl } : {})}
      />
      {photo.caption && (
        // A scrim, not glass: this is text over a photograph, and the
        // gradient guarantees its contrast whatever the photo holds.
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-4 pb-3 pt-10 text-[12.5px] font-medium leading-snug text-white">
          <span className="line-clamp-2">{photo.caption}</span>
        </figcaption>
      )}
    </figure>
  );
}

export default async function HeroPhotoGallery({
  photos,
}: {
  photos: PublicHomepagePhoto[];
}) {
  if (photos.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const [lead, second, third] = photos.slice(0, HERO_PHOTO_COUNT);
  const count = [lead, second, third].filter(Boolean).length;
  // Khmer has no italic: a browser fakes one by slanting the glyphs, which
  // drags stacked vowel signs off their consonants. Latin keeps the italic.
  const quoteStyle = locale === "en" ? "italic" : "";

  // Phones and tablets: the lead photo on its own row, the others beside each
  // other under it. From lg: lead on the left at full height, the others
  // stacked to its right — one grid, so every edge lines up.
  const grid =
    count === 1
      ? "grid-cols-1 lg:h-[460px]"
      : "grid-cols-2 lg:h-[460px] lg:grid-cols-[1.6fr_1fr] lg:grid-rows-2";

  return (
    <HomeSection surface="paper" labelledBy="library-life-title">
      <div className="grid items-center gap-10 lg:grid-cols-5 lg:gap-14">

        {/* ── Copy ── */}
        <div className="lg:col-span-2">
          <SectionHeader
            id="library-life-title"
            eyebrow={t("photosEyebrow")}
            title={t("photosTitle")}
            lede={t("photosBody")}
          />

          {/* Attribution is a person, not a work, so it is a <figcaption> —
              <cite> is for the title of a work. */}
          <figure className="relative m-0 rounded-xl border border-divider bg-bg-surface px-5 pb-4 pt-5">
            <Quote
              className="absolute -top-3.5 left-5 h-7 w-7 rounded-full bg-brand p-1.5 text-accent shadow-sm"
              fill="currentColor"
              strokeWidth={0}
              aria-hidden
            />
            <blockquote className="m-0">
              <p className={`font-khmer-serif text-[16px] leading-relaxed text-text-heading sm:text-[17px] ${quoteStyle}`}>
                {t("photosQuote")}
              </p>
            </blockquote>
            <figcaption className="mt-2 text-[12.5px] text-text-muted">
              {t("photosQuoteAuthor")}
            </figcaption>
          </figure>

          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* A same-page fragment, so it works before (or without) the app
                bundle and needs no locale prefix. */}
            <a
              href={`#${LIBRARY_NOW_ANCHOR}`}
              className="focus-field inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
            >
              <MapPin className="h-4 w-4" aria-hidden />
              {t("photosVisitCta")}
            </a>
            <Link
              href="/books"
              className="focus-field group inline-flex min-h-[44px] items-center gap-1.5 rounded-sm text-sm font-semibold text-brand transition-colors hover:text-brand-hover"
            >
              {t("photosCta")}
              <ArrowRight className="h-4 w-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>

        {/* ── Photos ── */}
        <div className="lg:col-span-3">
          <div className={`grid gap-3 sm:gap-4 ${grid}`}>
            <Tile
              photo={lead}
              sizes={count === 1 ? SIZES.solo : SIZES.lead}
              className={
                count === 1
                  ? "aspect-[16/10] lg:aspect-auto lg:h-full"
                  : "col-span-2 aspect-[16/10] lg:col-span-1 lg:row-span-2 lg:aspect-auto"
              }
            />
            {second && (
              <Tile
                photo={second}
                sizes={count === 2 ? SIZES.pair : SIZES.side}
                className={
                  count === 2
                    ? "col-span-2 aspect-[16/10] lg:col-span-1 lg:row-span-2 lg:aspect-auto"
                    : "aspect-[4/3] lg:aspect-auto"
                }
              />
            )}
            {third && <Tile photo={third} sizes={SIZES.side} className="aspect-[4/3] lg:aspect-auto" />}
          </div>
        </div>

      </div>
    </HomeSection>
  );
}
