"use client";

import { Download, FileSearch, Quote } from "lucide-react";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import CopyLinkButton from "@/components/ui/detail/CopyLinkButton";
import { activateThesisTab } from "@/lib/theses/tab-bus";
import { activatePublicationPreview } from "@/lib/publications/preview-bus";

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

type Labels = Partial<{
  download: string;
  pdfUnavailable: string;
  previewPdf: string;
  bookmarkSaved: string;
  bookmarkUnsaved: string;
  share: string;
  copyLink: string;
  exportCitation: string;
}>;

const DEFAULT_LABELS: Required<Labels> = {
  download: "Download PDF",
  pdfUnavailable: "PDF unavailable",
  previewPdf: "Preview PDF",
  bookmarkSaved: "Saved",
  bookmarkUnsaved: "Bookmark",
  share: "Share",
  copyLink: "Copy Link",
  exportCitation: "Export Citation",
};

/**
 * The full action set (Hero) and the compact "Quick Actions" recap (sticky
 * sidebar) share these primitives so behavior never drifts between the two.
 * Shared between theses and publications. Hero/Sidebar are Server Components,
 * so "Preview PDF" can't take a function prop across that boundary — instead
 * this resolves which client-only event bus to fire from `contentType`.
 */
export default function ActionButtons({
  id,
  contentType,
  title,
  fileHref,
  hasFile,
  shareUrl,
  variant = "full",
  labels,
  downloadSlot,
}: {
  id: string;
  contentType: "thesis" | "publication";
  title: string;
  fileHref: string;
  hasFile: boolean;
  shareUrl: string;
  variant?: "full" | "compact";
  labels?: Labels;
  /** Replaces the built-in download button (e.g. the gated thesis download).
   *  When provided, permission/state handling lives entirely in the slot. */
  downloadSlot?: React.ReactNode;
}) {
  const compact = variant === "compact";
  const t = { ...DEFAULT_LABELS, ...labels };
  const onPreview = contentType === "thesis"
    ? () => activateThesisTab("fulltext")
    : () => activatePublicationPreview();

  const downloadBtn = downloadSlot !== undefined ? downloadSlot : hasFile ? (
    <a
      href={`${fileHref}?download=1`}
      className={`btn-brand-gradient inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] font-bold text-white transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
        compact ? "w-full px-4 py-2.5 text-[13.5px]" : "px-6 py-2.5 text-[15px]"
      }`}
    >
      <Download className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
      {t.download}
    </a>
  ) : (
    <span
      title={`No PDF has been uploaded for this ${contentType} yet`}
      className={`inline-flex min-h-[44px] cursor-not-allowed items-center justify-center gap-2 rounded-[14px] border border-dashed border-divider text-text-muted ${
        compact ? "w-full px-4 py-2.5 text-[13.5px]" : "px-6 py-2.5 text-[15px]"
      }`}
    >
      <Download className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
      {t.pdfUnavailable}
    </span>
  );

  if (compact) {
    return (
      <div className="space-y-2">
        {downloadBtn}
        <div className="grid grid-cols-3 gap-2">
          <BookmarkButton
            id={id}
            contentType={contentType}
            label={{ saved: t.bookmarkSaved, unsaved: "Save" }}
            className={compactActionClass}
          />
          <ShareButton url={shareUrl} title={title} label={t.share} className={compactActionClass} />
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
          <button type="button" onClick={onPreview} className={contentActionClass}>
            <FileSearch className="h-4 w-4" />
            {t.previewPdf}
          </button>
        )}
      </div>

      {/* Tier 2 — utility actions, visually lighter than the row above */}
      <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
        <BookmarkButton
          id={id}
          contentType={contentType}
          label={{ saved: t.bookmarkSaved, unsaved: t.bookmarkUnsaved }}
          className={utilityActionClass}
        />
        <ShareButton url={shareUrl} title={title} label={t.share} className={utilityActionClass} />
        <CopyLinkButton url={shareUrl} compact className={utilityActionClass} />
        <a href="#cite-panel" className={utilityActionClass}>
          <Quote className="h-4 w-4" />
          {t.exportCitation}
        </a>
      </div>
    </div>
  );
}
