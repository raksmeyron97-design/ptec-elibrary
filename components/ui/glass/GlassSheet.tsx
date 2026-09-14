"use client";

// components/ui/glass/GlassSheet.tsx
// The one bottom sheet. Before it, the profile sheet, the /books filter sheet
// and the /posts filter sheet each hand-rolled the same scrim + panel + focus
// trap + Escape + scroll lock + inert-while-closing, in three slightly
// different sizes. New sheets use this; the two filter sheets are candidates
// to follow (docs/MOBILE-GLASS-UI.md).
//
// PORTALLED TO <body>, deliberately. A glass surface is `backdrop-filter`, and
// backdrop-filter (like transform and filter) makes its element the
// containing block for every `position: fixed` descendant — a sheet rendered
// inside the tab bar would have been pinned to the BAR, not the viewport.
// Rendering at the body root makes that impossible for every caller, instead
// of relying on each one to remember it. React context still flows through a
// portal, so translations and the session keep working.
//
// Only mounted while open (plus its exit transition), so the portal target
// always exists and nothing renders on the server.

import { useEffect, useEffectEvent, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useMountTransition } from "@/lib/hooks/useMountTransition";

export type GlassSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The heading; also the dialog's accessible name. */
  title: ReactNode;
  /** Keep the heading for assistive tech but draw a custom header instead
   *  (the profile sheet leads with the reader's own name). */
  hideTitle?: boolean;
  /** Accessible name of the close button, from the caller's catalogue. */
  closeLabel: string;
  /** Rendered between the header and the scrolling body. */
  header?: ReactNode;
  children: ReactNode;
  /** Pinned under the scrolling body — primary actions live here. */
  footer?: ReactNode;
  id?: string;
  /** Selector to focus on open instead of the first focusable element. */
  initialFocus?: string;
  /** Breakpoint class to hide the sheet where it has no job (e.g. "lg:hidden"). */
  className?: string;
};

export default function GlassSheet({
  open,
  onClose,
  title,
  hideTitle = false,
  closeLabel,
  header,
  children,
  footer,
  id,
  initialFocus,
  className = "",
}: GlassSheetProps) {
  const titleId = useId();
  const sheet = useMountTransition(open, 260);
  const trapRef = useFocusTrap<HTMLDivElement>(open && sheet.mounted, { initialFocus });

  // An Effect Event, so a caller passing an inline `onClose` does not re-bind
  // the key listener on every render — and the listener always calls the
  // latest one.
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The page behind a modal sheet must not scroll under the reader's thumb.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Every caller starts closed, so a sheet first mounts from a tap — on the
  // client, where the portal target exists. Nothing is ever server-rendered.
  if (!sheet.mounted || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-[110] bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none ${className}`}
        style={{ opacity: sheet.shown ? 1 : 0 }}
      />
      <div
        ref={trapRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Mounted-but-closing (exit transition): unreachable for focus and AT.
        inert={!open}
        tabIndex={-1}
        className={`glass-surface glass-surface--sheet fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] z-[120] mx-auto flex max-h-[min(85dvh,44rem)] max-w-lg flex-col overflow-hidden rounded-[28px] outline-none transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${className}`}
        style={{
          transform: sheet.shown ? "translateY(0)" : "translateY(calc(100% + 1.5rem))",
          opacity: sheet.shown ? 1 : 0,
        }}
      >
        {/* Grab handle — a visual cue that this is a sheet, not a control. */}
        <div className="flex shrink-0 justify-center pb-1 pt-2.5" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-[var(--ptec-border-strong)]" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 pb-1 pl-5 pr-2">
          <h2
            id={titleId}
            className={hideTitle ? "sr-only" : "min-w-0 text-[16px] font-bold leading-snug text-text-heading"}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-body transition-colors hover:bg-glass-selected hover:text-text-heading"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {header}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">{children}</div>

        {footer && <div className="shrink-0 border-t border-divider/70 px-4 py-3">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
