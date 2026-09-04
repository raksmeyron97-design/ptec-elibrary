"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export type SelectionPopup = {
  text: string;
  page: number;
  /** Anchor, relative to the document area: horizontal centre and top of the selection. */
  x: number;
  y: number;
  /** Bottom of the selection, for placing the popup below when there is no room above. */
  bottom: number;
} | null;

const MIN_SELECTION = 3;

/**
 * Text selection → action popup. Listens for the END of a selection gesture
 * (pointer up, or a key up for shift+arrow selections) rather than every
 * `selectionchange`, and anchors on the selection's own bounding box, so the
 * popup sits above the highlighted text on touch as well as with a mouse.
 */
export function useSelectionPopup({
  docAreaRef,
  enabled,
  currentPageRef,
}: {
  docAreaRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  currentPageRef: RefObject<number>;
}) {
  const [popup, setPopup] = useState<SelectionPopup>(null);
  const dismiss = useCallback(() => setPopup(null), []);

  useEffect(() => {
    const el = docAreaRef.current;
    if (!el || !enabled) return;

    const read = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || sel.rangeCount === 0 || text.length < MIN_SELECTION) {
        setPopup(null);
        return;
      }
      // Only selections inside the document's text layers count.
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      if (!anchor || !el.contains(anchor) || anchor.closest("[data-reader-hud], [data-reader-overlay]")) {
        setPopup(null);
        return;
      }
      let page: number | null = null;
      let node: Element | null = anchor;
      while (node && node !== el) {
        const p = node.getAttribute("data-page-number") || node.getAttribute("data-page");
        if (p) {
          page = parseInt(p, 10);
          break;
        }
        node = node.parentElement;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const host = el.getBoundingClientRect();
      setPopup({
        text,
        page: page || currentPageRef.current,
        x: rect.left + rect.width / 2 - host.left,
        y: rect.top - host.top,
        bottom: rect.bottom - host.top,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-reader-hud], [data-reader-overlay]")) return;
      // Let the browser finish committing the selection first.
      window.setTimeout(read, 0);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.startsWith("Arrow")) window.setTimeout(read, 0);
    };
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("keyup", onKeyUp);
    };
  }, [docAreaRef, enabled, currentPageRef]);

  return { popup, dismiss };
}
