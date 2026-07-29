// components/about/JourneyTimeline.tsx
//
// The institutional timeline on /about/our-journey.
//
// Layout decisions worth keeping:
//
//   • ONE COLUMN AT EVERY BREAKPOINT, with the year in a fixed-width gutter on
//     desktop and stacked above the entry on mobile. The alternating
//     left/right pattern this replaces looks impressive and reads badly: the
//     DOM order has to zig-zag to match the visual order, so a screen reader
//     or a keyboard user gets events out of sequence, and at tablet width the
//     two columns squeeze the text to unreadable measures.
//   • It is an <ol>. A timeline IS an ordered list, and saying so gives
//     assistive tech the count ("list, 2 items") and the position for free.
//   • The connecting line is a decorative pseudo-border on the list, not a
//     per-item element, so it can never desynchronise from the dots.
//
// The component renders whatever it is given and appends an explicit
// "more to come" affordance. It never pads a short list — the source form's
// timeline table was submitted empty, and inventing entries to make the design
// look finished is exactly what the brief forbids.

import Image from "next/image";
import type { AboutLocale } from "@/lib/about/format";
import { localized } from "@/lib/about/format";
import type { JourneyMilestone } from "@/lib/about/types";

export default function JourneyTimeline({
  milestones,
  locale,
  yearLabel,
  moreComingTitle,
  moreComingBody,
}: {
  milestones: JourneyMilestone[];
  locale: AboutLocale;
  yearLabel: string;
  moreComingTitle: string;
  moreComingBody: string;
}) {
  const published = milestones
    .filter((m) => m.isPublished)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <ol className="relative space-y-8 border-l border-divider pl-6 sm:space-y-10 sm:pl-8">
      {published.map((milestone) => {
        const title = localized(milestone.title, locale);
        const description = localized(milestone.description, locale);
        const alt = localized(milestone.imageAlt, locale);
        return (
          <li key={milestone.id} className="relative">
            {/* The dot sits on the border line: half its width to the left of
                the padding edge, so it is centred on the 1px rule. */}
            <span
              aria-hidden="true"
              className="absolute -left-[1.8125rem] top-1.5 h-3 w-3 rounded-full border-2 border-paper bg-brand sm:-left-[2.3125rem]"
            />
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-5">
              <p className="shrink-0 sm:w-20">
                <span className="sr-only">{yearLabel}: </span>
                <span className="text-sm font-semibold tabular-nums text-brand">
                  {milestone.year}
                </span>
              </p>
              <div className="min-w-0 flex-1">
                {title && (
                  <h3
                    lang={title.lang}
                    className="about-wrap text-base font-semibold text-text-heading"
                  >
                    {title.text}
                  </h3>
                )}
                {description && (
                  <p
                    lang={description.lang}
                    className="about-copy about-measure mt-1.5 text-sm text-text-body"
                  >
                    {description.text}
                  </p>
                )}
                {milestone.imageUrl && (
                  <div className="relative mt-4 aspect-[16/9] max-w-md overflow-hidden rounded-xl border border-divider bg-paper">
                    <Image
                      src={milestone.imageUrl}
                      alt={alt?.text ?? ""}
                      fill
                      loading="lazy"
                      sizes="(min-width: 640px) 28rem, 100vw"
                      className="object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}

      {/* Not a fake entry: an unmistakably open-ended marker, outside the
          numbered sequence, saying the history is still being compiled. */}
      <li className="relative">
        <span
          aria-hidden="true"
          className="absolute -left-[1.8125rem] top-1.5 h-3 w-3 rounded-full border-2 border-dashed border-border-strong bg-paper sm:-left-[2.3125rem]"
        />
        <div className="sm:ml-25">
          <p className="text-sm font-medium text-text-muted">{moreComingTitle}</p>
          <p className="about-copy about-measure mt-1 text-sm text-text-muted">
            {moreComingBody}
          </p>
        </div>
      </li>
    </ol>
  );
}
