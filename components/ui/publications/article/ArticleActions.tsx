"use client";

import { useTranslations } from "next-intl";
import { BookOpenText, Download, Quote } from "lucide-react";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ReadingListButton from "@/components/ui/books/ReadingListButton";
import ShareButton from "@/components/ui/books/ShareButton";
import { activatePublicationPreview } from "@/lib/publications/preview-bus";
import { openCiteDialog } from "@/lib/publications/cite-bus";

/** The id FloatingDock watches: the phone dock appears once this row has scrolled away. */
export const ARTICLE_ACTIONS_ID = "article-actions";

// Two tiers, and the difference is the point. Primary is what you came to do
// with a paper — read it, take the PDF. Secondary is housekeeping around it.
const primarySolid =
  "inline-flex min-h-12 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-3 text-[15px] font-bold text-brand-contrast shadow-sm transition-colors duration-150 hover:bg-brand-hover sm:flex-none sm:px-6";
const primaryOutline =
  "inline-flex min-h-12 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-brand bg-bg-surface px-3 text-[15px] font-bold text-brand transition-colors duration-150 hover:bg-brand/5 sm:flex-none sm:px-6";
const secondary =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[14px] font-semibold text-text-body transition-colors duration-150 hover:bg-paper hover:text-brand";
// In the rail the same controls are a column of quiet entries, so they read as
// a tool list beside the article rather than a second set of buttons competing
// with the two that matter.
const railItem =
  "inline-flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-md text-[13.5px] font-semibold text-text-muted transition-colors duration-150 hover:text-brand";

/**
 * The article's utility actions — cite, save, collect, share.
 *
 * One component, two shapes. Below `lg` they sit under the primary buttons as
 * a wrapping row; from `lg` they are the top of the right-hand tool rail, which
 * is where a scholarly reader looks for them (and what lets the rail start at
 * the masthead instead of at the abstract, leaving the top-right of the page
 * empty). They are never drawn twice: the page hides the row at `lg`.
 */
export function ArticleUtilityActions({
  id,
  title,
  shareUrl,
  orientation,
  className = "",
}: {
  id: string;
  title: string;
  shareUrl: string;
  orientation: "row" | "column";
  className?: string;
}) {
  const t = useTranslations("publicationDetail");
  const item = orientation === "column" ? railItem : secondary;

  return (
    <div
      className={
        orientation === "column"
          ? `flex flex-col items-start gap-0.5 ${className}`
          : // 2 × 2 on a phone, so no action is left alone on a second row;
            // one wrapping row from `sm`.
            `grid grid-cols-2 gap-1 sm:-ml-3 sm:flex sm:flex-wrap sm:items-center ${className}`
      }
    >
      <button type="button" onClick={() => openCiteDialog()} aria-haspopup="dialog" className={item}>
        <Quote className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("cite")}
      </button>
      {/* Save is this browser's shortcut list; Add to list is the account's
          collections (0136). Both existed before and both are kept. */}
      <BookmarkButton
        id={id}
        contentType="publication"
        plain
        label={{ saved: t("bookmarkSaved"), unsaved: t("save") }}
        className={item}
      />
      <ReadingListButton
        recordId={id}
        recordType="publication"
        className={item}
        label={{ add: t("addToList"), inLists: (count) => t("inLists", { count }) }}
      />
      <ShareButton url={shareUrl} title={title} label={t("share")} className={item} />
    </div>
  );
}

/**
 * The article's primary action row.
 *
 * `canRead` / `canDownload` are lib/publications/access.ts's answer — the SAME
 * resolution /api/publications/[slug]/file enforces — so this row can never
 * offer a PDF the server will refuse, nor hide one it would serve. The PDF
 * link goes through `?download=1`, which is where the route counts downloads;
 * "Read article" opens the inline reader, which the route counts as a read.
 * Nothing here links a raw storage URL.
 */
export default function ArticleActions({
  id,
  title,
  fileHref,
  shareUrl,
  canRead,
  canDownload,
}: {
  id: string;
  title: string;
  fileHref: string;
  shareUrl: string;
  canRead: boolean;
  canDownload: boolean;
}) {
  const t = useTranslations("publicationDetail");

  return (
    <div id={ARTICLE_ACTIONS_ID} className="flex flex-col gap-3">
      {(canRead || canDownload) && (
        <div className="flex gap-2">
          {canRead && (
            // A real in-page link first: without JavaScript it still jumps to
            // the full-text section.
            <a
              href="#fulltext"
              onClick={(event) => {
                event.preventDefault();
                activatePublicationPreview();
              }}
              className={primarySolid}
            >
              <BookOpenText className="h-[18px] w-[18px]" aria-hidden="true" />
              {t("readArticle")}
            </a>
          )}
          {canDownload && (
            <a href={`${fileHref}?download=1`} className={canRead ? primaryOutline : primarySolid}>
              <Download className="h-[18px] w-[18px]" aria-hidden="true" />
              {t("downloadPdf")}
            </a>
          )}
        </div>
      )}

      {/* From `lg` these live at the top of the tool rail instead. */}
      <ArticleUtilityActions
        id={id}
        title={title}
        shareUrl={shareUrl}
        orientation="row"
        className="lg:hidden"
      />
    </div>
  );
}
