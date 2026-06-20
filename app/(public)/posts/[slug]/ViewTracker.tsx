"use client";

// app/research/[slug]/ViewTracker.tsx
import { useEffect, useRef } from "react";
import { incrementPostViews } from "@/app/actions/post-views";

export default function ViewTracker({ postId }: { postId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Best-effort — ignore failures, never block the page.
    incrementPostViews(postId).catch(() => {});
  }, [postId]);

  return null;
}
