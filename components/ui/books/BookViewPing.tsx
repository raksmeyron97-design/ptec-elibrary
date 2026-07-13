"use client";

import { useEffect } from "react";
import { incrementViewCount } from "@/app/actions/view-count";

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
    incrementViewCount(bookId).catch(() => {});
  }, [bookId]);

  return null;
}
