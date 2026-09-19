// components/policy/PolicyLayout.tsx
//
// The reading shell both trust documents share: a sticky table-of-contents
// rail, the content column, and a floating back-to-top.
//
// WHAT IS DELIBERATELY NOT HERE
//
// The scroll progress bar. `components/ui/animations/ReadingProgress` is
// already mounted by app/[locale]/(public)/layout.tsx on EVERY public page —
// 3px, `transform: scaleX()`, driven by `animation-timeline: scroll(root)`,
// with no JavaScript at all and no bar under prefers-reduced-motion. Adding a
// second one here would paint two bars on top of each other and put back the
// per-frame main-thread work that component exists to remove.
//
// `.policy-print-expand` on the wrapper is what lets the print stylesheet
// reveal collapsed answers and filtered-out table rows; `.policy-page` is what
// forces black-on-white. Both must stay on this element — a page that drops
// the shell loses its printed form silently.
//
// Server component.

import type { ReactNode } from "react";
import PolicyTOC, { type TocChapter, type TocItem } from "./PolicyTOC";
import PolicyBackToTop from "./PolicyBackToTop";

export default function PolicyLayout({
  chapters,
  items,
  labels,
  km,
  children,
}: {
  /** Grouped table of contents (/privacy). */
  chapters?: TocChapter[];
  /** Flat table of contents (/policy). */
  items?: TocItem[];
  labels: { tocTitle: string; tocMobile: string; backToTop: string };
  km: boolean;
  children: ReactNode;
}) {
  return (
    <div className="policy-page policy-print-expand bg-paper">
      <div className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6 md:px-8">
        <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
          <div className="pt-8 lg:pt-10">
            <PolicyTOC
              chapters={chapters}
              items={items}
              title={labels.tocTitle}
              mobileLabel={labels.tocMobile}
              km={km}
            />
          </div>

          {/* `min-w-0` is load-bearing: without it a wide table or a long
              Khmer compound inside this column stretches the grid track and
              the sticky rail is pushed off screen. */}
          <div className="min-w-0 pt-2 lg:pt-10">{children}</div>
        </div>
      </div>

      <PolicyBackToTop label={labels.backToTop} />
    </div>
  );
}
