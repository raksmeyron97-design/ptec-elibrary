"use client";

import { useEffect } from "react";
import { incrementViewCount } from "@/app/actions/view-count";
import { landingEntryClass } from "@/lib/analytics/entry-class";

/**
 * Fire-and-forget detail-view analytics ping, mounted on the book detail
 * page (same pattern as posts' ViewTracker / theses' ThesisViewPing).
 * A per-tab sessionStorage guard stops soft-navigation loops from
 * double-counting the same book within a session.
 */
export default function BookViewPing({ bookId }: { bookId: string }) {
  useEffect(() => {
    if (!bookId) return;
    const key = `ptec.viewped.book.${bookId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode — fall through and ping anyway.
    }
    // How this tab's session began (WI-3) — the class only, never a referrer.
    incrementViewCount(bookId, landingEntryClass()).catch(() => {});
  }, [bookId]);

  return null;
}
