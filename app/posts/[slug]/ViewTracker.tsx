"use client";

// app/research/[slug]/ViewTracker.tsx
import { useEffect, useRef } from "react";
import { incrementViews } from "@/app/admin/posts/actions";

export default function ViewTracker({ postId }: { postId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Best-effort — ignore failures, never block the page.
    incrementViews(postId).catch(() => {});
  }, [postId]);

  return null;
}