"use client";

// The "Full text" section of the record page.
//
// It exists for one reason beyond styling: the PDF must not be fetched until
// somebody asks for it. The tab strip this page used to have marked the
// full-text tab `lazy`, so the viewer only mounted on the first click. Moving
// every section onto one scrolling page removed that gate — and a thesis PDF
// is tens of megabytes, downloaded on every record view by every reader who
// only wanted the abstract. This restores the gate as an explicit affordance
// instead of a side effect of tabs.
//
// It also answers the header's "Preview PDF" button, over lib/theses/
// reader-bus.ts: that button scrolls here and fires the event this component
// listens for, so one control opens one reader wherever it is pressed.
//
// Analytics note: `recordReaderOpen` is called with "research_report", the
// content type this table actually is. <PDFReaderLauncher> — the equivalent
// component on the books side — hard-codes "book", which is why this is a
// separate component rather than a reuse of it.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, FileText, Loader2 } from "lucide-react";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import { recordReaderOpen } from "@/app/actions/reader-events";
import { onThesisReaderOpen } from "@/lib/theses/reader-bus";

export default function FullTextSection({
  reportId,
  title,
  fileHref,
  reportEmail,
  language,
}: {
  reportId: string;
  title: string;
  fileHref: string;
  reportEmail?: string | null;
  language?: string | null;
}) {
  const t = useTranslations("reader");
  const [open, setOpen] = useState(false);

  const openReader = useCallback(() => {
    setOpen(true);
    // One "reader opened" event per thesis per tab session, matching the
    // funnel the books reader records.
    const key = `ptec.readeropen.thesis.${reportId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode — ping anyway.
    }
    recordReaderOpen("research_report", reportId).catch(() => {});
  }, [reportId]);

  useEffect(() => onThesisReaderOpen(openReader), [openReader]);

  if (open) {
    return (
      <div className="overflow-hidden rounded-2xl border border-divider">
        <PDFViewer
          title={title}
          pdfUrl={fileHref}
          bookId={reportId}
          totalPages={100}
          initialProgressPct={0}
          initialMaxProgressPct={0}
          // In-reader "download" would fetch the public preview route and
          // bypass the download-permission gate. Reading/preview stays
          // available; the gated Download button (ThesisDownloadButton) is the
          // only save path.
          allowDownload={false}
          reportEmail={reportEmail}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl bg-bg-app p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      {/* A document mark, not a page thumbnail. Rendering real thumbnails
          means fetching the PDF, which is the exact cost this panel defers. */}
      <span
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-bg-surface text-brand shadow-sm"
      >
        <FileText className="h-6 w-6" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-text-heading">
          The complete document is available as a PDF
          {language ? <span className="font-normal text-text-muted"> · {language}</span> : null}
        </p>
        <p className="mt-1 text-[13.5px] leading-[1.6] text-text-muted">{t("readerLoadHint")}</p>
      </div>
      <button
        type="button"
        onClick={openReader}
        className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-bold text-brand-contrast transition-colors duration-150 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        {t("openReader")}
      </button>
    </div>
  );
}

/** Skeleton shown while the viewer chunk loads. Exported for reuse by the
 *  page's Suspense boundary; kept here so the two never drift in size. */
export function FullTextSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading document"
      className="flex items-center gap-3 rounded-2xl bg-bg-app p-6"
    >
      <Loader2 className="h-4 w-4 animate-spin text-text-muted motion-reduce:animate-none" aria-hidden="true" />
      <span className="text-[13.5px] text-text-muted">Loading document…</span>
    </div>
  );
}
