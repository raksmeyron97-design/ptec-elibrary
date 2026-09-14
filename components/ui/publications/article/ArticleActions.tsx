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
  "inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-bold text-brand-contrast shadow-sm transition-colors duration-150 hover:bg-brand-hover min-[420px]:flex-none";
const primaryOutline =
  "inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-brand bg-bg-surface px-6 text-[15px] font-bold text-brand transition-colors duration-150 hover:bg-brand/5 min-[420px]:flex-none";
const secondary =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[14px] font-semibold text-text-body transition-colors duration-150 hover:bg-paper hover:text-brand";

/**
 * The article's action row.
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
    <div id={ARTICLE_ACTIONS_ID} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
      {(canRead || canDownload) && (
        <div className="flex flex-col gap-2 min-[420px]:flex-row">
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

      <div className="-ml-3 flex flex-wrap items-center gap-x-1 gap-y-1">
        <button type="button" onClick={() => openCiteDialog()} aria-haspopup="dialog" className={secondary}>
          <Quote className="h-4 w-4" aria-hidden="true" />
          {t("cite")}
        </button>
        {/* Save is this browser's shortcut list; Add to list is the account's
            collections (0136). Both existed before and both are kept. */}
        <BookmarkButton
          id={id}
          contentType="publication"
          plain
          label={{ saved: t("bookmarkSaved"), unsaved: t("save") }}
          className={secondary}
        />
        <ReadingListButton
          recordId={id}
          recordType="publication"
          className={secondary}
          label={{ add: t("addToList"), inLists: (count) => t("inLists", { count }) }}
        />
        <ShareButton url={shareUrl} title={title} label={t("share")} className={secondary} />
      </div>
    </div>
  );
}
