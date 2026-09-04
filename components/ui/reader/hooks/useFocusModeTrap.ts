"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus reading mode: the reader becomes a fixed, modal surface. While it is
 * active, Tab cycles inside it, body scroll is locked, and on exit focus
 * returns to whatever had it. Focus lands on the document VIEWPORT on entry
 * (not a toolbar button): arrow keys work immediately and the auto-hide
 * timer is not pinned open by a control holding focus.
 */
export function useFocusModeTrap({
  active,
  rootRef,
  viewportRef,
}: {
  active: boolean;
  rootRef: RefObject<HTMLElement | null>;
  viewportRef: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;
    const restore = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.closest("[inert]") && (el.offsetParent !== null || el === document.activeElement),
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => (viewportRef.current ?? root).focus());
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restore?.focus?.();
    };
  }, [active, rootRef, viewportRef]);
}
