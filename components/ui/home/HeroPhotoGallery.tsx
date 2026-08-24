// components/ui/home/HeroPhotoGallery.tsx
// "Life at the library" — a split band pairing one line of copy with an
// asymmetric photo mosaic drawn from the admin-managed gallery (migration
// 0118, /admin/homepage-photos).
//
// It sits BELOW the hero and is deliberately not the hero itself: the hero
// background is the LCP element and is served from pre-generated local
// variants (public/hero/*) that can be preloaded at build time. An
// admin-uploadable remote URL cannot be, so promoting these photos into the
// hero would trade a measured 1.98 s FCP for an unbounded one.
//
// Renders nothing when the gallery is empty — an empty photo frame says less
// about the library than no section at all.
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import type { PublicHomepagePhoto } from "@/lib/types/homepage-photo";

/** Photos consumed by the mosaic. The rest feed <NarrativeCards> and the
 *  "+N more" badge. Mirrors HERO_SLOTS in the admin grid. */
export const HERO_PHOTO_COUNT = 3;

/**
 * Per-slot `sizes`. Each is the slot's real share of the 1400px container, so
 * a phone never downloads a desktop-width file for a photo that renders at a
 * third of the screen.
 */
const SIZES = [
  "(max-width: 1024px) 100vw, 45vw", // main
  "(max-width: 1024px) 50vw, 26vw",  // bottom-left
  "(max-width: 1024px) 40vw, 18vw",  // floating
];

export default async function HeroPhotoGallery({
  photos,
  totalCount,
}: {
  photos: PublicHomepagePhoto[];
  /** Every active photo, not just the ones rendered here — drives "+N more". */
  totalCount: number;
}) {
  if (photos.length === 0) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
  const [main, second, third] = photos.slice(0, HERO_PHOTO_COUNT);
  const remaining = Math.max(0, totalCount - photos.slice(0, HERO_PHOTO_COUNT).length);

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="library-life-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-5 lg:gap-12">

          {/* ── Copy ── */}
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center gap-3">
              <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-brand to-accent" aria-hidden />
              <span className={`text-[11px] font-bold text-brand ${latinEyebrow}`}>
                {t("photosEyebrow")}
              </span>
            </div>
            <h2
              id="library-life-title"
              className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
              style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
            >
              {t("photosTitle")}
            </h2>

            {/* The quote is attributed copy, so it is a real <blockquote> with
                a <cite> — not a styled paragraph. */}
            <blockquote className="mt-5 border-l-[3px] border-accent pl-4">
              <p className="text-[15px] italic leading-relaxed text-text-body">{t("photosQuote")}</p>
              <cite className="mt-1.5 block text-[12.5px] not-italic text-text-muted">
                {t("photosQuoteAuthor")}
              </cite>
            </blockquote>

            <p className="mt-5 text-[14.5px] leading-relaxed text-text-muted">{t("photosBody")}</p>

            <Link
              href="/books"
              className="focus-field mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
            >
              {t("photosCta")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {/* ── Mosaic ──
              Absolute positioning only from lg: below that the overlap turns
              three photos into an unreadable pile on a 360px screen, so phones
              and tablets get a plain two-row grid instead. */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:relative lg:block lg:h-[460px] lg:gap-0">

              <figure className="col-span-2 lg:absolute lg:right-0 lg:top-0 lg:m-0 lg:h-[85%] lg:w-[75%]">
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-bg-surface shadow-xl lg:aspect-auto lg:h-full">
                  <Image
                    src={main.url}
                    alt={main.alt}
                    fill
                    sizes={SIZES[0]}
                    quality={85}
                    className="object-cover"
                    {...(main.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: main.blurDataUrl } : {})}
                  />
                </div>
                {main.caption && (
                  <figcaption className="mt-2 text-[12.5px] text-text-muted lg:hidden">
                    {main.caption}
                  </figcaption>
                )}
              </figure>

              {second && (
                <figure className="lg:absolute lg:bottom-0 lg:left-0 lg:z-10 lg:m-0 lg:h-[50%] lg:w-[45%]">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border-4 border-paper bg-bg-surface shadow-lg lg:aspect-auto lg:h-full">
                    <Image
                      src={second.url}
                      alt={second.alt}
                      fill
                      sizes={SIZES[1]}
                      quality={85}
                      className="object-cover"
                      {...(second.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: second.blurDataUrl } : {})}
                    />
                  </div>
                </figure>
              )}

              {third && (
                <figure className="lg:absolute lg:left-[10%] lg:top-8 lg:z-20 lg:m-0 lg:h-[35%] lg:w-[30%]">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border-4 border-paper bg-bg-surface shadow-md lg:aspect-auto lg:h-full">
                    <Image
                      src={third.url}
                      alt={third.alt}
                      fill
                      sizes={SIZES[2]}
                      quality={85}
                      className="object-cover"
                      {...(third.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: third.blurDataUrl } : {})}
                    />
                  </div>
                </figure>
              )}

              {remaining > 0 && (
                // Left-aligned below lg on purpose: the mobile nav's floating
                // action button occupies the bottom-right corner, and a
                // right-aligned line lands underneath it.
                <p className="col-span-2 text-left text-[12px] font-medium text-text-muted lg:absolute lg:bottom-4 lg:right-4 lg:z-30 lg:col-span-1 lg:rounded-lg lg:bg-paper/90 lg:px-3 lg:py-1.5 lg:text-right lg:shadow-sm lg:backdrop-blur-sm">
                  {t("photosMore", { count: remaining })}
                </p>
              )}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
