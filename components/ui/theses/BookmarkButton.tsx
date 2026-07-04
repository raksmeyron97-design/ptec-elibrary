"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { isThesisBookmarked, toggleThesisBookmark } from "@/lib/theses/local-bookmarks";

/**
 * Saves a thesis locally (this browser only — see lib/theses/local-bookmarks.ts).
 * Reads localStorage after mount to avoid an SSR/client markup mismatch.
 */
export default function BookmarkButton({
  reportId,
  className = "",
  label,
}: {
  reportId: string;
  className?: string;
  /** When set, renders as a labeled button instead of an icon-only control. */
  label?: { saved: string; unsaved: string };
}) {
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSaved(isThesisBookmarked(reportId));
    setMounted(true);
  }, [reportId]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setSaved(toggleThesisBookmark(reportId));
      }}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved theses" : "Save thesis"}
      title={saved ? "Saved" : "Save"}
      className={`inline-flex cursor-pointer items-center justify-center rounded-full border transition-all duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
        saved
          ? "border-accent/60 bg-accent/15 text-accent-text"
          : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-brand"
      } ${mounted ? "" : "opacity-0"} ${className}`}
    >
      <Bookmark
        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${saved ? "scale-110" : "scale-100"}`}
        fill={saved ? "currentColor" : "none"}
        strokeWidth={2}
      />
      {label && (saved ? label.saved : label.unsaved)}
    </button>
  );
}
