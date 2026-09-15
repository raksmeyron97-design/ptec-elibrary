"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { isThesisBookmarked, toggleThesisBookmark } from "@/lib/theses/local-bookmarks";
import { isPublicationBookmarked, togglePublicationBookmark } from "@/lib/publications/local-bookmarks";

/**
 * Saves a thesis or publication locally (this browser only — see
 * lib/theses/local-bookmarks.ts / lib/publications/local-bookmarks.ts).
 * Reads localStorage after mount to avoid an SSR/client markup mismatch.
 */
export default function BookmarkButton({
  id,
  contentType,
  className = "",
  label,
  plain = false,
  iconLabel,
}: {
  id: string;
  contentType: "thesis" | "publication";
  className?: string;
  /** When set, renders as a labeled button instead of an icon-only control. */
  label?: { saved: string; unsaved: string };
  /**
   * Drop the built-in pill (border, fill, rounding) so the caller's
   * `className` is the whole appearance — the journal article's quiet
   * secondary actions. With a visible `label` the button is then named by
   * that text alone (WCAG 2.5.3, label in name), and `aria-pressed` carries
   * the state. `iconLabel` names the icon-only form in the reader's language.
   */
  plain?: boolean;
  iconLabel?: { save: string; remove: string };
}) {
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  const isBookmarked = contentType === "thesis" ? isThesisBookmarked : isPublicationBookmarked;
  const toggleBookmark = contentType === "thesis" ? toggleThesisBookmark : togglePublicationBookmark;

  useEffect(() => {
    setSaved(isBookmarked(id));
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, contentType]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setSaved(toggleBookmark(id));
      }}
      aria-pressed={saved}
      aria-label={
        plain && label
          ? undefined // the visible text is the name
          : plain && iconLabel
            ? saved
              ? iconLabel.remove
              : iconLabel.save
            : saved
              ? `Remove from saved ${contentType === "thesis" ? "theses" : "publications"}`
              : `Save ${contentType}`
      }
      title={plain ? undefined : saved ? "Saved" : "Save"}
      className={
        plain
          ? `${mounted ? "" : "opacity-0"} ${className}`
          : `inline-flex cursor-pointer items-center justify-center rounded-full border transition-all duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
              saved
                ? "border-accent/60 bg-accent/15 text-accent-text"
                : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-brand"
            } ${mounted ? "" : "opacity-0"} ${className}`
      }
    >
      <Bookmark
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${saved ? "scale-110" : "scale-100"}`}
        fill={saved ? "currentColor" : "none"}
        strokeWidth={2}
      />
      {label && (saved ? label.saved : label.unsaved)}
    </button>
  );
}
