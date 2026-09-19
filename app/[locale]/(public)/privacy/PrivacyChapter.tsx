import type { ReactNode } from "react";

/**
 * A numbered chapter heading over a run of policy sections.
 *
 * Fifteen sections is more than a reader holds in their head, and a flat list
 * gives them no way to tell "what you hand us" from "what we do with it". The
 * chapters add that one level of structure and nothing else — they do not
 * reorder, hide, collapse or renumber a section, and every existing `#anchor`
 * keeps working, so a link someone saved to `#retention` still lands on
 * retention.
 *
 * `content-visibility: auto` (via `.cv-auto`) lets the browser skip layout and
 * paint for the chapters below the fold. `contain-intrinsic-size` on that
 * class reserves approximate height, so the scrollbar does not jump — which is
 * what makes this safe on a page that is mostly text.
 *
 * The heading is an <h2> and the sections inside it keep their own <h2>s
 * rather than being demoted to <h3>: the section headings are the page's
 * landmarks, they are what the table of contents points at, and pushing all
 * fifteen down a level to gain a grouping label would flatten the outline a
 * screen-reader user navigates by.
 *
 * Server component.
 */
export default function PrivacyChapter({
  id,
  number,
  title,
  summary,
  km,
  children,
}: {
  id: string;
  number: number;
  title: string;
  summary: string;
  km: boolean;
  children: ReactNode;
}) {
  const font = km ? "font-khmer-serif" : "";
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="policy-chapter cv-auto scroll-mt-28"
    >
      <div className="border-b border-divider pb-4">
        <div className="flex items-baseline gap-3">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-brand-contrast"
          >
            {number}
          </span>
          <h2
            id={`${id}-heading`}
            className={`policy-wrap text-[19px] font-bold leading-snug text-text-heading ${font}`}
          >
            {/* The number is decorative in the heading box above, so it is
                spoken here instead — otherwise the accessible name of this
                landmark is "How we use, share and protect it" with no
                indication of where it sits in the document. */}
            <span className="sr-only">{number}. </span>
            {title}
          </h2>
        </div>
        <p className="policy-copy policy-measure mt-2 pl-10 text-[14px] text-text-muted">{summary}</p>
      </div>

      <div className="mt-8 space-y-12">{children}</div>
    </section>
  );
}
