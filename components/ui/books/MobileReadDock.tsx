"use client";

// components/ui/books/MobileReadDock.tsx
// The book page's primary action, kept within reach on a phone.
//
// Measured on production at 390 × 844: "Read online" sat at y = 1,816 px —
// the third screen — under the cover, the badges, a long title and the
// summary. This dock carries it (with the reader's progress when resuming)
// on a FloatingDock, which shows only while the in-page action row is off
// screen and steps away at the footer.
//
// It also carries the assistant's entry point on phone book pages, where the
// floating assistant button steps aside (lib/nav/shell-routes.ts) — one
// floating control per corner. The assistant opens scoped to THIS book: it
// derives the record from the URL and offers book-specific starters, so
// nothing needs to be pre-filled.

import { BookOpenText, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { openLibraryAssistant } from "@/lib/ask/open";
import FloatingDock from "@/components/ui/glass/FloatingDock";

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
  return (
    <FloatingDock watchId={watchId} className="lg:hidden">
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
    </FloatingDock>
  );
}
