"use client";

import { Download, FileSearch, Quote } from "lucide-react";
import BookmarkButton from "@/components/ui/theses/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import CopyLinkButton from "@/components/ui/theses/detail/CopyLinkButton";
import { activateThesisTab } from "@/lib/theses/tab-bus";

// Tier 1 — the two things you actually do with a document. Same height/weight
// as the primary Download button so the row reads as one aligned group.
const contentActionClass =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-divider bg-bg-surface px-5 py-2.5 text-[14px] font-bold text-text-heading transition-all duration-150 hover:border-brand/30 hover:bg-brand/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

// Tier 2 — bookmark/share/cite/copy-link. Deliberately lighter (no border,
// no shadow) so it recedes behind the two content actions above it instead
// of competing with them for attention.
const utilityActionClass =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-text-muted transition-all duration-150 hover:bg-bg-app hover:text-brand active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

const compactActionClass =
  "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3 py-2 text-[12.5px] font-bold text-text-heading transition-all duration-150 hover:border-brand/30 hover:bg-brand/5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

/**
 * The full action set (Hero) and the compact "Quick Actions" recap (sticky
 * sidebar) share these primitives so behavior never drifts between the two.
 */
export default function ActionButtons({
  reportId,
  title,
  fileHref,
  hasFile,
  shareUrl,
  variant = "full",
}: {
  reportId: string;
  title: string;
  fileHref: string;
  hasFile: boolean;
  shareUrl: string;
  variant?: "full" | "compact";
}) {
  const compact = variant === "compact";

  const downloadBtn = hasFile ? (
    <a
      href={`${fileHref}?download=1`}
      className={`btn-brand-gradient inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] font-bold text-white transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
        compact ? "w-full px-4 py-2.5 text-[13.5px]" : "px-6 py-2.5 text-[15px]"
      }`}
    >
      <Download className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
      Download PDF
    </a>
  ) : (
    <span
      title="No PDF has been uploaded for this thesis yet"
      className={`inline-flex min-h-[44px] cursor-not-allowed items-center justify-center gap-2 rounded-[14px] border border-dashed border-divider text-text-muted ${
        compact ? "w-full px-4 py-2.5 text-[13.5px]" : "px-6 py-2.5 text-[15px]"
      }`}
    >
      <Download className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
      PDF unavailable
    </span>
  );

  if (compact) {
    return (
      <div className="space-y-2">
        {downloadBtn}
        <div className="grid grid-cols-3 gap-2">
          <BookmarkButton
            reportId={reportId}
            label={{ saved: "Saved", unsaved: "Save" }}
            className={compactActionClass}
          />
          <ShareButton url={shareUrl} title={title} label="Share" className={compactActionClass} />
          <a href="#cite-panel" className={compactActionClass}>
            <Quote className="h-4 w-4" />
            Cite
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tier 1 — content actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {downloadBtn}
        {hasFile && (
          <button type="button" onClick={() => activateThesisTab("fulltext")} className={contentActionClass}>
            <FileSearch className="h-4 w-4" />
            Preview PDF
          </button>
        )}
      </div>

      {/* Tier 2 — utility actions, visually lighter than the row above */}
      <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
        <BookmarkButton
          reportId={reportId}
          label={{ saved: "Saved", unsaved: "Bookmark" }}
          className={utilityActionClass}
        />
        <ShareButton url={shareUrl} title={title} label="Share" className={utilityActionClass} />
        <CopyLinkButton url={shareUrl} compact className={utilityActionClass} />
        <a href="#cite-panel" className={utilityActionClass}>
          <Quote className="h-4 w-4" />
          Export Citation
        </a>
      </div>
    </div>
  );
}
