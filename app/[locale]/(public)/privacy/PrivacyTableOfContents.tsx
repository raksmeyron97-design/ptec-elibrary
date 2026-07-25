"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { ChevronDown, List } from "lucide-react";

type Item = { id: string; label: string };

/**
 * Table of contents with active-section tracking.
 *
 * - Desktop (lg+): a sticky sidebar `<nav>`; the link for the section in view
 *   gets `aria-current="location"` and brand styling.
 * - Mobile (<lg): a native `<details>` disclosure ("On this page") holding the
 *   same links — keyboard- and screen-reader-friendly with no custom ARIA, and
 *   it works even before hydration. It closes itself after a link is chosen.
 *
 * Active state uses one IntersectionObserver (no scroll listener) and is torn
 * down on unmount. Labels arrive as props, so this reads no message namespace.
 */
export default function PrivacyTableOfContents({
  items,
  title,
  mobileLabel,
  km,
}: {
  items: Item[];
  title: string;
  mobileLabel: string;
  km: boolean;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const font = km ? "font-khmer-serif" : "";

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  // Close the mobile disclosure after a link is chosen. Reads the DOM from the
  // click event (never a ref during render), so no ref is needed.
  const closeMobileNav = (e: MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.closest("details")?.removeAttribute("open");
  };

  const linkClass = (id: string, active: boolean) =>
    `block rounded-md border-l-2 py-1.5 pl-3 pr-2 text-[13.5px] leading-snug transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
      active
        ? "border-brand bg-brand/5 font-semibold text-brand"
        : "border-transparent text-text-body hover:border-divider hover:text-text-heading"
    } ${font}`;

  const list = (onNavigate?: (e: MouseEvent<HTMLAnchorElement>) => void) => (
    <ul className="space-y-0.5">
      {items.map(({ id, label }) => {
        const active = activeId === id;
        return (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={onNavigate}
              aria-current={active ? "location" : undefined}
              className={linkClass(id, active)}
            >
              {label}
            </a>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Mobile disclosure */}
      <details className="mb-6 rounded-xl border border-divider bg-bg-surface shadow-sm lg:hidden print:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[14px] font-semibold text-text-heading [&::-webkit-details-marker]:hidden">
          <span className={`flex items-center gap-2 ${font}`}>
            <List className="h-[18px] w-[18px] text-brand" aria-hidden="true" />
            {mobileLabel}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180 [details[open]_&]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <nav aria-label={mobileLabel} className="border-t border-divider px-2 py-2">
          {list(closeMobileNav)}
        </nav>
      </details>

      {/* Desktop sticky sidebar */}
      <nav
        aria-label={title}
        className="sticky top-28 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block print:hidden"
      >
        <p
          className={`mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted ${font}`}
        >
          {title}
        </p>
        {list()}
      </nav>
    </>
  );
}
