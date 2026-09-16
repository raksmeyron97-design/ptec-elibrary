"use client";

// components/ui/books/RecentlyViewedRecorder.tsx
// Records this book in the device's recently-viewed list (lib/recently-viewed)
// so the offline pages can still show it when the network is gone. Mounted
// on the book detail page beside BookViewPing. Renders nothing.

import { useEffect } from "react";
import { recordRecentlyViewed } from "@/lib/recently-viewed";

export default function RecentlyViewedRecorder({
  slug,
  title,
  author,
  coverUrl,
}: {
  slug: string;
  title: string;
  author?: string | null;
  coverUrl?: string | null;
}) {
  useEffect(() => {
    recordRecentlyViewed({ slug, title, author, coverUrl });
  }, [slug, title, author, coverUrl]);

  return null;
}
