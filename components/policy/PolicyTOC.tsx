"use client";

// components/policy/PolicyTOC.tsx
//
// The table of contents shared by /privacy and /policy. Generalised from the
// privacy page's own TOC, with two additions: optional CHAPTER grouping, and
// a keyboard model for the rail.
//
// - Desktop (lg+): a sticky `<nav>` rail. The section in view carries
//   `aria-current="location"`.
// - Mobile (<lg): a native `<details>` disclosure holding the same links —
//   keyboard- and screen-reader-friendly with no custom ARIA, and it works
//   before hydration. It closes itself after a link is chosen.
//
// Active tracking is ONE IntersectionObserver over the section headings, never
// a scroll listener: a scroll handler on a 15-section document fires on every
// frame of a flick, and this page is read on the phones the library is read on.
//
// Labels arrive as PROPS. `privacy` and `policy` are deliberately absent from
// PUBLIC_NAMESPACES (i18n/pick-messages.ts) — putting either one in would
// serialise the whole policy catalogue into every public page's RSC payload,
// including the homepage. Nothing in this file reads a message namespace.

import { useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import { ChevronDown, List } from "lucide-react";

export type TocItem = { id: string; label: string };

export type TocChapter = {
  id: string;
  /** Rendered as "1", "2", … before the chapter label. */
  number: number;
  label: string;
  items: TocItem[];
};

type Props = {
  /** Grouped form (/privacy). Exactly one of `chapters` / `items` is given. */
  chapters?: TocChapter[];
  /** Flat form (/policy). */
  items?: TocItem[];
  title: string;
  mobileLabel: string;
  km: boolean;
};

export default function PolicyTOC({ chapters, items, title, mobileLabel, km }: Props) {
  const flat: TocItem[] = chapters ? chapters.flatMap((c) => c.items) : (items ?? []);
  const [activeId, setActiveId] = useState(flat[0]?.id ?? "");
  // The observer depends on WHICH SECTIONS exist, not on the array identity —
  // and `flat` is rebuilt on every render, so listing it as a dependency would
  // tear down and rebuild the IntersectionObserver on every render. Collapsing
  // the ids to one string makes the dependency the actual question, so the
  // effect is honest about what it watches and needs no lint exemption.
  const observedIds = flat.map((i) => i.id).join("|");
  const railRef = useRef<HTMLElement>(null);
  const font = km ? "font-khmer-serif" : "";

  useEffect(() => {
    const headings = observedIds
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Top margin clears the sticky header; the -70% bottom margin means a
      // section becomes "active" as it reaches the upper third of the
      // viewport, not when its last pixel leaves — otherwise the rail lags a
      // full section behind the reader on a long scroll.
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [observedIds]);

  // Close the mobile disclosure after a link is chosen. Reads the DOM from the
  // click event, so no ref is needed.
  const closeMobileNav = (e: MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.closest("details")?.removeAttribute("open");
  };

  /**
   * Arrow-key movement inside the rail. A TOC is a list of links, so Tab
   * already reaches every one — this only adds the faster axis a reader
   * expects from a vertical nav, and Home/End to jump the ends. It never
   * takes Tab over: nothing here is a roving-tabindex widget, because making
   * it one would REMOVE the ability to tab through the sections.
   */
  const onRailKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const links = Array.from(
      e.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href^='#']"),
    );
    if (links.length === 0) return;
    const here = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (here === -1) return;
    e.preventDefault();
    const next =
      e.key === "ArrowDown"
        ? Math.min(here + 1, links.length - 1)
        : e.key === "ArrowUp"
          ? Math.max(here - 1, 0)
          : e.key === "Home"
            ? 0
            : links.length - 1;
    links[next]?.focus();
  };

  const linkClass = (active: boolean) =>
    `block rounded-md border-l-2 py-1.5 pl-3 pr-2 text-[13.5px] leading-snug transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app ${
      active
        ? "border-brand bg-brand/5 font-semibold text-brand"
        : "border-transparent text-text-body hover:border-divider hover:text-text-heading"
    } ${font}`;

  const links = (list: TocItem[], onNavigate?: (e: MouseEvent<HTMLAnchorElement>) => void) => (
    <ul className="space-y-0.5">
      {list.map(({ id, label }) => {
        const active = activeId === id;
        return (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={onNavigate}
              aria-current={active ? "location" : undefined}
              className={linkClass(active)}
            >
              {label}
            </a>
          </li>
        );
      })}
    </ul>
  );

  const body = (onNavigate?: (e: MouseEvent<HTMLAnchorElement>) => void) =>
    chapters ? (
      <ol className="space-y-4">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <p
              className={`mb-1 flex items-baseline gap-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-text-muted ${font}`}
            >
              <span
                aria-hidden="true"
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold not-italic text-brand"
              >
                {chapter.number}
              </span>
              <span className="policy-wrap">{chapter.label}</span>
            </p>
            {links(chapter.items, onNavigate)}
          </li>
        ))}
      </ol>
    ) : (
      links(flat, onNavigate)
    );

  return (
    <>
      {/* Mobile disclosure */}
      <details
        className="mb-6 rounded-xl border border-divider bg-bg-surface shadow-sm lg:hidden"
        data-policy-print="hide"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[14px] font-semibold text-text-heading [&::-webkit-details-marker]:hidden">
          <span className={`flex items-center gap-2 ${font}`}>
            <List className="h-[18px] w-[18px] text-brand" aria-hidden="true" />
            {mobileLabel}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 [details[open]_&]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <nav aria-label={mobileLabel} className="border-t border-divider px-2 py-3">
          {body(closeMobileNav)}
        </nav>
      </details>

      {/* Desktop sticky rail */}
      <nav
        ref={railRef}
        aria-label={title}
        onKeyDown={onRailKeyDown}
        className="sticky top-28 hidden max-h-[calc(100vh-8rem)] overflow-y-auto pb-6 lg:block"
        data-policy-print="hide"
      >
        <p
          className={`mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted ${font}`}
        >
          {title}
        </p>
        {body()}
      </nav>
    </>
  );
}
