// components/ui/home/NarrativeCards.tsx
// Three photo cards — Focus / Discover / Connect — continuing the gallery
// below <HeroPhotoGallery>. Fed by the 4th–6th active photo in
// /admin/homepage-photos, so an editor changes what these say by dragging.
//
// Renders nothing unless all three slots are filled: two cards in a
// three-column grid leaves a hole, and a single card reads as a mistake.
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import type { PublicHomepagePhoto } from "@/lib/types/homepage-photo";

/** Headings are fixed editorial copy, not per-photo captions: they name the
 *  three things the library is for, and translate as a set. */
const HEADINGS = ["narrativeFocus", "narrativeDiscover", "narrativeConnect"] as const;
const BODIES = ["narrativeFocusBody", "narrativeDiscoverBody", "narrativeConnectBody"] as const;

export const NARRATIVE_PHOTO_COUNT = HEADINGS.length;

export default async function NarrativeCards({
  photos,
}: {
  photos: PublicHomepagePhoto[];
}) {
  if (photos.length < NARRATIVE_PHOTO_COUNT) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
  const cards = photos.slice(0, NARRATIVE_PHOTO_COUNT);

  return (
    <section className="border-b border-divider/60 bg-bg-surface" aria-labelledby="narrative-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        <div className="mb-8 max-w-2xl">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-brand to-accent" aria-hidden />
            <span className={`text-[11px] font-bold text-brand ${latinEyebrow}`}>
              {t("narrativeEyebrow")}
            </span>
          </div>
          <h2
            id="narrative-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("narrativeTitle")}
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-text-muted">{t("narrativeBody")}</p>
        </div>

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((photo, i) => (
            <li
              key={photo.id}
              // motion-safe: the lift and the zoom are decorative, and a reader
              // who asked their OS for reduced motion gets neither.
              className="group overflow-hidden rounded-xl border border-divider bg-paper transition-shadow hover:shadow-lg motion-safe:transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-1"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-bg-surface">
                <Image
                  src={photo.url}
                  alt={photo.alt}
                  fill
                  // Below the fold — next/image lazy-loads by default; nothing
                  // here should compete with the hero for bandwidth.
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  quality={85}
                  className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
                  {...(photo.blurDataUrl
                    ? { placeholder: "blur" as const, blurDataURL: photo.blurDataUrl }
                    : {})}
                />
              </div>
              <div className="p-6">
                <h3 className="font-khmer-serif text-[17px] font-bold leading-snug text-text-heading">
                  {t(HEADINGS[i])}
                </h3>
                {/* The caption is the editor's voice about this specific photo;
                    the fixed body copy is the fallback when they left it blank. */}
                <p className="mt-2 text-[13.5px] leading-relaxed text-text-muted">
                  {photo.caption ?? t(BODIES[i])}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
