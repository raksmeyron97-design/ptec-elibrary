// components/ui/animations/ScrollRevealWrapper.tsx
// Scroll reveal, CSS only: `.reveal` in app/globals.css. Each element fades
// up as IT scrolls into view, driven by a scroll-driven animation
// (animation-timeline: view()) — no IntersectionObserver and no client
// JavaScript, so these wrappers work in server components too.
//
// Why it changed: the observer revealed a whole CONTAINER once 15 % of it was
// on screen. A 1,500 px grid needed ~230 px of it scrolled into view — empty —
// before anything appeared, then revealed every row at once, most of them
// still below the fold, so the stagger (nth-child delays) played where nobody
// could see it. Now each card reveals as it arrives, and a row of cards
// arrives together because it shares a scroll position: the stagger is the
// layout, not a hand-tuned delay.
//
// Unsupported browsers (Firefox; Safari before 26) and readers who prefer
// reduced motion get everything visible and still — docs/MOBILE-GLASS-UI.md
// rule 11: a scroll-linked effect is CSS behind @supports, never a scroll
// listener. The same API as before, so call sites did not change.

import type { ReactNode } from "react";

type Props = { children: ReactNode; className?: string };

/** Fade-up for a block: a heading row, a card. Keep it to things about one
 *  screen tall or less — the fade finishes 140 px into the element. */
export function ScrollRevealWrapper({ children, className }: Props) {
  return <div className={`reveal ${className ?? ""}`}>{children}</div>;
}

/** The container no longer animates — its items do, each on its own. */
export function StaggerRevealContainer({ children, className }: Props) {
  return <div className={className}>{children}</div>;
}

export function StaggerRevealItem({ children, className }: Props) {
  return <div className={`reveal ${className ?? ""}`}>{children}</div>;
}
