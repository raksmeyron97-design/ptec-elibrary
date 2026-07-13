"use client";

// app/research/[slug]/ViewTracker.tsx
import { useEffect, useRef } from "react";
import { incrementPostViews } from "@/app/actions/post-views";

export default function ViewTracker({ postId }: { postId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !postId) return;
    fired.current = true;
    // One event per post per tab session — soft navigations back to the same
    // post must not inflate analytics.
    const key = `ptec.viewped.post.${postId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode — ping anyway.
    }
    // Best-effort — ignore failures, never block the page.
    incrementPostViews(postId).catch(() => {});
  }, [postId]);

  return null;
}
