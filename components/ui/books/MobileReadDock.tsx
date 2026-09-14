"use client";

// components/ui/books/MobileReadDock.tsx
// The book page's primary action, kept within reach on a phone.
//
// Measured on production at 390 × 844: "Read online" sat at y = 1,816 px —
// the third screen — under the cover, the badges, a long title and the
// summary. This dock is a glass bar above the tab bar that appears only while
// the in-page action row is OFF screen (above or below), and steps away when
// the reader reaches it, so the same button is never drawn twice. It also
// steps away once the footer scrolls in, so it never covers the page's end.
//
// It carries the assistant's entry point on phone book pages, where the
// floating assistant button steps aside (lib/nav/shell-routes.ts) — one
// floating control per corner. The assistant opens scoped to THIS book: it
// derives the record from the URL and offers book-specific starters, so
// nothing needs to be pre-filled.

import { useEffect, useState } from "react";
import { BookOpenText, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { openLibraryAssistant } from "@/lib/ask/open";

export default function MobileReadDock({
  watchId,
  href,
  label,
  progressPct,
  progressLabel,
  askLabel,
}: {
  /** id of the in-page action row this dock stands in for. */
  watchId: string;
  href: string;
  label: string;
  /** Present when the reader is resuming. */
  progressPct?: number;
  /** e.g. "13% read" — already localised by the server. */
  progressLabel?: string;
  askLabel: string;
}) {
  // Hidden until the observer has actually measured: a dock that flashes in
  // on load and then leaves is worse than one that arrives a frame late.
  const [actionsVisible, setActionsVisible] = useState(true);
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const actions = document.getElementById(watchId);
    const footer = document.querySelector("footer");
    if (!actions || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === actions) setActionsVisible(entry.isIntersecting);
        else setFooterVisible(entry.isIntersecting);
      }
    });
    observer.observe(actions);
    if (footer) observer.observe(footer);
    return () => observer.disconnect();
  }, [watchId]);

  const shown = !actionsVisible && !footerVisible;

  return (
    <div
      aria-hidden={!shown}
      inert={!shown}
      className={`glass-surface glass-surface--strong fixed inset-x-2.5 bottom-[calc(var(--ptec-mobile-nav-clearance)+0.5rem)] z-40 mx-auto flex max-w-md items-center gap-1.5 rounded-[22px] p-1.5 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none lg:hidden print:hidden ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <Link
        href={href}
        className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[16px] bg-brand px-4 text-[15px] font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
      >
        <BookOpenText className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
        {progressPct !== undefined && progressPct > 0 && (
          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-semibold tabular-nums">
            {progressLabel ?? `${progressPct}%`}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={() => openLibraryAssistant()}
        aria-label={askLabel}
        title={askLabel}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-glass-selected text-brand transition-colors hover:bg-brand hover:text-brand-contrast"
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
