"use client";

// components/layout/FooterBackToTop.tsx
// The one control in the footer that needs a click handler. Smooth scroll is
// dropped under prefers-reduced-motion, and focus moves to the page's main
// landmark so a keyboard or screen-reader user lands where the scroll did.

import { ArrowUp } from "lucide-react";

// Module scope: it closes over nothing, so there is no reason to rebuild it on
// every render.
function scrollToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  } catch {
    window.scrollTo(0, 0);
  }
  document.getElementById("main-content")?.focus({ preventScroll: true });
}

export default function FooterBackToTop({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <button type="button" onClick={scrollToTop} aria-label={label} className={className}>
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
