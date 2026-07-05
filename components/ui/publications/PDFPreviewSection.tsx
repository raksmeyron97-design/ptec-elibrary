"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileX2, FileSearch, ExternalLink } from "lucide-react";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import { onPublicationPreviewOpen } from "@/lib/publications/preview-bus";

/**
 * Stacked, always-mounted section (not a hidden tab panel) so SectionQuickNav
 * scrollspy can target it. Click-to-reveal replaces the old lazy tab-mount
 * semantics — the PDF viewer (and its DOMMatrix-touching react-pdf internals)
 * only mounts once the user actually asks to preview.
 */
export default function PDFPreviewSection({
  title,
  pdfUrl,
  fileHref,
  publicationId,
  hasFile,
}: {
  title: string;
  pdfUrl: string;
  fileHref: string;
  publicationId: string;
  hasFile: boolean;
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
      <div className="mb-3 flex items-center justify-end">
        <a
          href={fileHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-muted transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("openInNewTab")}
        </a>
      </div>

      {revealed ? (
        <div className="-m-1">
          <PDFViewer
            title={title}
            pdfUrl={pdfUrl}
            bookId={publicationId}
            totalPages={100}
            initialProgressPct={0}
            initialMaxProgressPct={0}
            allowDownload={true}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-divider bg-bg-surface py-16 text-center transition-colors hover:border-brand/40 hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/8 text-brand">
            <FileSearch className="h-7 w-7" />
          </span>
          <span className="text-[14px] font-semibold text-text-heading">{t("previewFullText")}</span>
          <span className="max-w-xs text-[13px] text-text-muted">{t("previewFullTextHint")}</span>
        </button>
      )}
    </div>
  );
}
