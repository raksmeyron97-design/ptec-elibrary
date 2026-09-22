"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useLatest } from "./hooks/useLatest";

/* The phone page scrubber — the slider every reading app puts along the
   bottom. Before it, a phone reader had no progress on screen at all (the
   bar was desktop-only) and the only way to move far was the Go to page
   dialog: tap the indicator, type a number, confirm.

   Drag: a bubble names the page under the thumb; the reader moves when the
   finger LIFTS, never on every step, so a drag across 400 pages fetches one
   page window rather than the 399 it passes over (the mount plan already
   makes a jump cheap: lib/reader/prefetch.ts).

   The commit is the native `change` event and nothing else: it is the one
   signal that also fires for a keyboard arrow and for a screen reader's
   swipe-to-adjust (VoiceOver / TalkBack), which send no pointer events at
   all — and it fires once per drag, so one drag is one jump. pointerup,
   pointercancel and blur never commit; they only clear a drag that ended
   where it began, which moved no value and so sends no `change`. */

type Fmt = (n: number | string) => string;

export default function ReaderScrubber({
  currentPage,
  numPages,
  progressPct,
  onCommit,
  fmt,
}: {
  currentPage: number;
  numPages: number;
  progressPct: number;
  onCommit: (page: number) => void;
  fmt: Fmt;
}) {
  const t = useTranslations("reader");
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef(false);
  const latest = useLatest({ currentPage, onCommit });

  // Bound natively: React's `onChange` is the `input` event, and the commit
  // must be the real `change`. Re-bound when the input first appears
  // (`numPages` crossing 2), since below that there is no input to bind to.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const commit = () => {
      if (!pending.current) return;
      pending.current = false;
      setDraft(null);
      const page = Number(el.value);
      if (Number.isFinite(page) && page !== latest.current.currentPage) latest.current.onCommit(page);
    };
    // A drag that ends where it began sends no `change`: clear its bubble.
    const settle = () => {
      if (!pending.current || Number(el.value) !== latest.current.currentPage) return;
      pending.current = false;
      setDraft(null);
    };
    el.addEventListener("change", commit);
    el.addEventListener("pointerup", settle);
    el.addEventListener("pointercancel", settle);
    el.addEventListener("blur", settle);
    return () => {
      el.removeEventListener("change", commit);
      el.removeEventListener("pointerup", settle);
      el.removeEventListener("pointercancel", settle);
      el.removeEventListener("blur", settle);
    };
  }, [latest, numPages]);

  if (numPages < 2) return <div className="min-w-0 flex-1 md:hidden" />;

  const value = draft ?? currentPage;
  const pct = ((value - 1) / (numPages - 1)) * 100;
  const label = t("pageIndicator", { current: fmt(value), total: fmt(numPages) });
  // While dragging, the figure follows the thumb (same rule as useReaderProgress).
  const shownPct = draft !== null ? Math.round((draft / numPages) * 100) : progressPct;

  return (
    <div className="reader-scrubber md:hidden">
      <div className="relative min-w-0 flex-1">
        {draft !== null && (
          // Clamped so the bubble never leaves the screen at either end.
          <span
            aria-hidden="true"
            className="reader-scrubber__bubble"
            style={{ left: `clamp(3.75rem, ${pct}%, calc(100% - 3.75rem))` }}
          >
            {label}
          </span>
        )}
        <input
          ref={inputRef}
          type="range"
          min={1}
          max={numPages}
          step={1}
          value={value}
          aria-label={t("goToPage")}
          aria-valuetext={label}
          onChange={(e) => {
            pending.current = true;
            setDraft(Number(e.currentTarget.value));
          }}
          className="reader-scrubber__input"
        />
      </div>
      <span className="reader-muted shrink-0 text-[12px] font-semibold tabular-nums" aria-hidden="true">
        {fmt(shownPct)}%
      </span>
    </div>
  );
}
