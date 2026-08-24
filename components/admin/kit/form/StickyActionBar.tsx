"use client";

import { useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";

/**
 * The floating action bar: the save cluster, detached and pinned near the bottom
 * of the viewport.
 *
 * It floats rather than sitting flush to the card's bottom edge. Flush, it read
 * as the end of the document — so on a long section an author scrolled past it
 * looking for the "real" save button. Inset and shadowed, it reads as chrome
 * layered over the form, which is what it is: always available, never the end of
 * anything.
 *
 * It lives inside the card, so it is already the width of the form column and
 * needs no max-width of its own — the primary button lands under the form's
 * right edge rather than a 27" screen's.
 *
 * `status` is the left slot: "Unsaved changes", "3 blocking", "Saved 2 minutes
 * ago". The bar is the one element always on screen, so it is the honest place
 * for save state; a banner at the top of a seven-section form is not.
 */
export default function StickyActionBar({
  status,
  children,
}: {
  status?: React.ReactNode;
  /** Buttons, in DOM order least- to most-primary. */
  children: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-4 z-30 mx-3 mb-4 rounded-xl border border-divider bg-bg-surface/95 px-4 py-3 shadow-lg backdrop-blur sm:mx-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">{status}</div>
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

/* ── Button recipes ─────────────────────────────────────────────────────────
   Exported as class strings rather than components so a caller can put them on
   a <button type="submit">, an <a>, or a next/link without this module having
   to model every element. All three carry .focus-field: the admin panel's
   focus ring comes from the token system (docs/ACCESSIBILITY-FOCUS.md), never
   from a hand-written ring utility. */

export const BTN_PRIMARY =
  "focus-field inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-admin-accent px-5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-admin-accent-hover disabled:cursor-not-allowed disabled:opacity-60";

export const BTN_SECONDARY =
  "focus-field inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body shadow-sm transition-all duration-200 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60";

export const BTN_DANGER =
  "focus-field inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-danger transition-all duration-200 hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60";

/** Spinner + label for a button mid-submit. */
export function ButtonBusy({ label }: { label: string }) {
  return (
    <>
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {label}
    </>
  );
}

/* ── Save-state pills for the bar's status slot ─────────────────────────── */

export function UnsavedPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-warning-text">
      <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
      {label}
    </span>
  );
}

export function BlockingPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-danger-line bg-danger-soft px-2 py-0.5 font-semibold text-danger-text">
      {label}
    </span>
  );
}

export function WarningPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-line bg-warning-soft px-2 py-0.5 font-semibold text-warning-text">
      {label}
    </span>
  );
}

const TICK_MS = 30_000;
function subscribeToClock(onChange: () => void) {
  const id = setInterval(onChange, TICK_MS);
  return () => clearInterval(id);
}
const clockSnapshot = () => Math.floor(Date.now() / TICK_MS);
const clockServerSnapshot = () => 0;

/**
 * "Saved 2 minutes ago", ticking on its own.
 *
 * Reads the clock through `useSyncExternalStore` rather than calling
 * `Date.now()` in render — that is impure, and React may re-render this for
 * reasons unrelated to time. The snapshot is a 30-second bucket, stable
 * between ticks, which is exactly the resolution the label needs.
 */
export function SavedPill({
  at,
  format,
}: {
  at: number | null;
  /** (secondsAgo) => label. Caller owns the wording so this stays translatable. */
  format: (secondsAgo: number) => string;
}) {
  const bucket = useSyncExternalStore(subscribeToClock, clockSnapshot, clockServerSnapshot);
  if (at == null) return null;
  const seconds = Math.max(0, Math.round((bucket * TICK_MS - at) / 1000));
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-success-text">
      <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
      {format(seconds)}
    </span>
  );
}
