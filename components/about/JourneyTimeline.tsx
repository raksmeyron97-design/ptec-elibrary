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
    // The rule is a gradient that fades out past the last entry — the history
    // is open-ended, and a hard line ending in mid-air said "cut off".
    <ol className="relative space-y-6 pl-7 before:absolute before:bottom-0 before:left-0 before:top-2 before:w-px before:bg-gradient-to-b before:from-brand before:via-divider before:to-transparent sm:space-y-8 sm:pl-9">
      {published.map((milestone) => {
        const title = localized(milestone.title, locale);
        const description = localized(milestone.description, locale);
        const alt = localized(milestone.imageAlt, locale);
        return (
          <li key={milestone.id} className="relative">
            {/* The dot sits on the border line: half its width to the left of
                the padding edge, so it is centred on the 1px rule. */}
            {/* Navy dot with a soft gold halo, centred on the 1px rule. */}
            <span
              aria-hidden="true"
              className="absolute -left-[2.0625rem] top-4 h-3.5 w-3.5 rounded-full border-2 border-paper bg-brand shadow-[0_0_0_4px_rgba(221,176,34,0.28)] sm:-left-[2.5625rem]"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
              <p className="shrink-0 pt-2.5 sm:w-20">
                <span className="sr-only">{yearLabel}: </span>
                <span className="inline-flex items-center rounded-full bg-brand px-2.5 py-0.5 text-sm font-semibold tabular-nums text-brand-contrast">
                  {milestone.year}
                </span>
              </p>
              <div className="min-w-0 flex-1 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
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
          className="absolute -left-[2.0625rem] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-dashed border-border-strong bg-paper sm:-left-[2.5625rem]"
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
