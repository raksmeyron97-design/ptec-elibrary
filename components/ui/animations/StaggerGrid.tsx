"use client";

// components/ui/animations/StaggerGrid.tsx
// A grid whose items rise in, one after another, as it scrolls into view.
// CSS now: the same IntersectionObserver reveal as ScrollRevealWrapper sets
// `data-revealed`, and `.scroll-reveal-stagger` (app/globals.css) does the
// motion — opacity + transform, staggered by nth-child. It used to be
// framer-motion variants, which put the whole animation library on the
// homepage's critical path for eight subject tiles.
//
// Same API as before (`as="ul"` / `as="li"`), so call sites did not change.
// No-JS and reduced motion: items are simply visible (the hidden start state
// is only ever armed by the observer).

import type { ReactNode, RefObject } from "react";
import { useReveal } from "./ScrollRevealWrapper";

type ContainerTag = "div" | "ul";
type ItemTag = "div" | "li";

export function StaggerGrid({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: ContainerTag;
}) {
  const ref = useReveal<HTMLElement>();
  const cls = `scroll-reveal-stagger ${className ?? ""}`;
  return as === "ul" ? (
    <ul ref={ref as RefObject<HTMLUListElement>} className={cls}>
      {children}
    </ul>
  ) : (
    <div ref={ref as RefObject<HTMLDivElement>} className={cls}>
      {children}
    </div>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: ItemTag;
}) {
  const cls = `scroll-reveal-item ${className ?? ""}`;
  return as === "li" ? <li className={cls}>{children}</li> : <div className={cls}>{children}</div>;
}
