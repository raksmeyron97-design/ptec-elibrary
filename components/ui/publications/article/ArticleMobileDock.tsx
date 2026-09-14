"use client";

import { useTranslations } from "next-intl";
import { BookOpenText, Download, Quote, Sparkles } from "lucide-react";
import FloatingDock from "@/components/ui/glass/FloatingDock";
import { ARTICLE_ACTIONS_ID } from "@/components/ui/publications/article/ArticleActions";
import { activatePublicationPreview } from "@/lib/publications/preview-bus";
import { openCiteDialog } from "@/lib/publications/cite-bus";
import { openLibraryAssistant } from "@/lib/ask/open";

const iconButton =
  "flex h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[16px] bg-glass-selected px-3 text-[13px] font-bold text-brand transition-colors hover:bg-brand hover:text-brand-contrast";

/**
 * The article's actions, kept within reach on a phone once the header's
 * action row has scrolled away (FloatingDock watches it and steps aside at the
 * footer). Same access decision as the header — the caller passes the flags —
 * so the dock can no more offer a refused PDF than the header can.
 *
 * It also carries the assistant's entry point: on article pages the floating
 * assistant button steps aside on phones (lib/nav/shell-routes.ts), exactly as
 * on book pages, so there is one floating control per corner. The assistant
 * scopes to this article from the URL (lib/ask/resource-context.ts).
 */
export default function ArticleMobileDock({
  canRead,
  canDownload,
  fileHref,
}: {
  canRead: boolean;
  canDownload: boolean;
  fileHref: string;
}) {
  const t = useTranslations("publicationDetail");

  return (
    <FloatingDock watchId={ARTICLE_ACTIONS_ID} revealAfterPassed className="lg:hidden">
      {canRead ? (
        <a
          href="#fulltext"
          onClick={(event) => {
            event.preventDefault();
            activatePublicationPreview();
          }}
          className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[16px] bg-brand px-4 text-[15px] font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
        >
          <BookOpenText className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("readArticle")}</span>
        </a>
      ) : (
        <button
          type="button"
          onClick={() => openCiteDialog()}
          aria-haspopup="dialog"
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-brand px-4 text-[15px] font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
        >
          <Quote className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("cite")}</span>
        </button>
      )}
      {canDownload && (
        <a href={`${fileHref}?download=1`} className={iconButton}>
          <Download className="h-5 w-5" aria-hidden="true" />
          {t("pdfShort")}
          <span className="sr-only"> — {t("downloadPdf")}</span>
        </a>
      )}
      {canRead && (
        <button
          type="button"
          onClick={() => openCiteDialog()}
          aria-haspopup="dialog"
          aria-label={t("cite")}
          title={t("cite")}
          className={iconButton}
        >
          <Quote className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => openLibraryAssistant()}
        aria-label={t("askAboutArticle")}
        title={t("askAboutArticle")}
        className={iconButton}
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </button>
    </FloatingDock>
  );
}
