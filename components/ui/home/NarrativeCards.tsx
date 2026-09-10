// components/ui/home/NarrativeCards.tsx
// Three photo cards — Focus / Discover / Connect — continuing the gallery
// below <HeroPhotoGallery>. Fed by the 4th–6th active photo in
// /admin/homepage-photos, so an editor changes what these say by dragging.
//
// Renders nothing unless all three slots are filled: two cards in a
// three-column grid leaves a hole, and a single card reads as a mistake.
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { PublicHomepagePhoto } from "@/lib/types/homepage-photo";
import { HomeSection, SectionHeader } from "./HomeSection";

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

  const t = await getTranslations("home");
  const cards = photos.slice(0, NARRATIVE_PHOTO_COUNT);

  return (
    /* Shares <HeroPhotoGallery>'s paper ground on purpose: the two bands are
       two halves of one gallery, and a colour change between them would
       assert a break in subject that isn't there. */
    <HomeSection surface="paper" labelledBy="narrative-title">
      <SectionHeader
        id="narrative-title"
        eyebrow={t("narrativeEyebrow")}
        title={t("narrativeTitle")}
        lede={t("narrativeBody")}
      />

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((photo, i) => (
            <li
              key={photo.id}
              // motion-safe: the lift and the zoom are decorative, and a reader
              // who asked their OS for reduced motion gets neither.
              className="group overflow-hidden rounded-xl border border-divider bg-bg-surface transition-shadow hover:shadow-lg motion-safe:transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-1"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-paper">
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
    </HomeSection>
  );
}
