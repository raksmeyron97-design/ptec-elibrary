// components/ui/animations/StaggerGrid.tsx
// A grid whose items rise in as each one scrolls into view — CSS only, the
// same `.reveal` scroll-driven animation as ScrollRevealWrapper (see the
// note there for why it is per item rather than per container). It used to
// be framer-motion variants, then an IntersectionObserver; now it ships no
// JavaScript at all.
//
// Same API as before (`as="ul"` / `as="li"`), so call sites did not change.
// Unsupported browsers and reduced motion: items are simply visible.

import type { ReactNode } from "react";

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
  return as === "ul" ? <ul className={className}>{children}</ul> : <div className={className}>{children}</div>;
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
  const cls = `reveal ${className ?? ""}`;
  return as === "li" ? <li className={cls}>{children}</li> : <div className={cls}>{children}</div>;
}
