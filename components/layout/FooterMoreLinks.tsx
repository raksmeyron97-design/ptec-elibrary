// components/layout/FooterMoreLinks.tsx
// The phone footer's single "More links" disclosure (components/layout/
// Footer.tsx). Below md it folds every link the compact footer does not show
// up front — the four link groups and the legal pair — behind one tap. From
// md up it is invisible: the <details> is hidden and the body is
// `display: contents`, so the groups it wraps are the footer grid's columns,
// exactly as before.
//
// NO JAVASCRIPT, ON PURPOSE. It is a native <details> whose body is EMPTY:
// the links it reveals are its next sibling, opened by one CSS rule
// (`.footer-more[open] + .footer-more-body` in app/globals.css). A React
// button here lost every tap made before the page hydrated — measured, the
// e2e click did nothing — and on a 2–4 GB Android phone hydration can take
// seconds, which is exactly when a reader at the bottom of a page reaches for
// these links. The adjacent-sibling selector works in every browser; the
// body cannot live inside the <details> because a closed <details> hides its
// content and could not then be the grid's columns from md up.
//
// The links stay in the DOM while folded: crawlers follow them
// (e2e/seo.spec.ts pins the /subjects and /authors hub links). Opening is a
// 200 ms opacity + translate, off under reduced motion; the chevron turns by
// transform. The summary announces its own collapsed/expanded state, and the
// links it reveals come next in reading order.

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function FooterMoreLinks({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <details className="footer-more group md:hidden">
        <summary className="focus-field flex min-h-12 w-full cursor-pointer list-none items-center justify-between gap-3 border-t border-white/10 text-left text-[15px] font-semibold text-white outline-none [&::-webkit-details-marker]:hidden">
          {label}
          <ChevronDown
            className="h-5 w-5 shrink-0 text-blue-200/80 transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
      </details>
      <div className="footer-more-body md:contents">{children}</div>
    </>
  );
}
