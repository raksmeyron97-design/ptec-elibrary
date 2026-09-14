"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileX2, FileSearch, ExternalLink } from "lucide-react";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import { onPublicationPreviewOpen } from "@/lib/publications/preview-bus";

/**
 * Stacked, always-mounted section (not a hidden tab panel) so the article's
 * "On this page" rail can target it. Click-to-reveal replaces the old lazy tab-mount
 * semantics — the PDF viewer (and its DOMMatrix-touching react-pdf internals)
 * only mounts once the user actually asks to preview.
 */
export default function PDFPreviewSection({
  title,
  pdfUrl,
  fileHref,
  publicationId,
  hasFile,
  reportEmail,
}: {
  title: string;
  pdfUrl: string;
  fileHref: string;
  publicationId: string;
  hasFile: boolean;
  /** Published support address for the broken-file report link. */
  reportEmail?: string | null;
}) {
  const t = useTranslations("publicationDetail");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => onPublicationPreviewOpen(() => setRevealed(true)), []);

  if (!hasFile) {
    return (
      <div className="fade-rise-in flex flex-col items-center gap-3 rounded-2xl border border-dashed border-divider bg-bg-surface py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-app">
          <FileX2 className="h-7 w-7 text-text-muted/50" />
        </span>
        <p className="text-[14px] font-medium text-text-heading">{t("noPdf")}</p>
        <p className="max-w-xs text-[13px] text-text-muted">{t("noPdfHint")}</p>
      </div>
    );
  }

  return (
    <div>
      {revealed ? (
        <>
          <div className="mb-3 flex items-center justify-end">
            <a
              href={fileHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-semibold text-brand transition-colors hover:bg-brand/5"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("openInNewTab")}
            </a>
          </div>
          <div className="-m-1">
            <PDFViewer
              title={title}
              pdfUrl={pdfUrl}
              bookId={publicationId}
              totalPages={100}
              initialProgressPct={0}
              initialMaxProgressPct={0}
              allowDownload={true}
              reportEmail={reportEmail}
            />
          </div>
        </>
      ) : (
        // The reader (react-pdf and its worker) mounts only when asked for.
        // Until then this is a quiet panel with one clear action, plus the
        // plain link for readers who would rather use their own PDF viewer.
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-divider bg-paper px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-text-heading">{t("previewFullText")}</p>
              <p className="mt-0.5 text-[13.5px] text-text-muted">{t("previewFullTextHint")}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <FileSearch className="h-4 w-4" aria-hidden="true" />
              {t("readArticle")}
            </button>
            <a
              href={fileHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-brand transition-colors hover:bg-brand/5"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("openInNewTab")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
