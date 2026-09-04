"use client";

import { useEffect, type RefObject } from "react";
import { shortcutFor, type ReaderAction } from "@/lib/reader/shortcuts";

export type KeyboardState = {
  /** A dialog or menu is open — it owns Escape and the arrow keys. */
  overlayOpen: boolean;
  /** Something the global Escape should close, in priority order. Returns
      true when it consumed the key. */
  onEscape: () => boolean;
  /** Ctrl/⌘+0 is only claimed while the reader owns focus. */
  focusMode: boolean;
  rootRef: RefObject<HTMLElement | null>;
  onAction: (action: Exclude<ReaderAction, "escape">) => void;
};

/**
 * The reader's keyboard bindings, resolved through `lib/reader/shortcuts`
 * so the help dialog and the handler can never disagree.
 *
 * Registered in the CAPTURE phase on window: the navbar binds "/" site-wide
 * to open the global search page, and while a document is open in-document
 * search owns that key. Everything else is left alone when focus is in a
 * field (except Escape, which must close panes from the search box too).
 */
export function useReaderKeyboard(latest: RefObject<KeyboardState>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = latest.current;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;

      if (e.key === "Escape") {
        if (s.overlayOpen) return; // the overlay's own handler closes it
        if (inField) target?.blur();
        if (s.onEscape()) e.stopPropagation(); // consumed — no other Esc handlers
        return;
      }
      if (inField || s.overlayOpen) return;

      const action = shortcutFor(e);
      if (!action || action === "escape") return;
      if (action === "resetZoom") {
        // Browser zoom shortcuts stay untouched unless the reader owns focus.
        if (!(s.focusMode || s.rootRef.current?.contains(document.activeElement))) return;
      }
      e.preventDefault();
      if (action === "search") e.stopPropagation(); // beat the navbar's "/" binding
      s.onAction(action);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [latest]);
}
