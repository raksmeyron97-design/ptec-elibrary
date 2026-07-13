"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { BookOpen, ExternalLink, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import { recordReaderOpen } from "@/app/actions/reader-events";

type PDFReaderLauncherProps = {
  title: string;
  pdfUrl?: string | null;
  bookId: string;
  totalPages?: number;
  initialProgressPct?: number;
  initialMaxProgressPct?: number;
  allowDownload?: boolean;
  isLoggedIn?: boolean;
  fullReaderHref?: string;
};

export default function PDFReaderLauncher({
  title,
  pdfUrl,
  bookId,
  totalPages = 0,
  initialProgressPct = 0,
  initialMaxProgressPct = 0,
  allowDownload = true,
  isLoggedIn = false,
  fullReaderHref,
}: PDFReaderLauncherProps) {
  const t = useTranslations("reader");
  const bookT = useTranslations("bookDetail");
  const [open, setOpen] = useState(false);

  // Funnel analytics: one "reader opened" event per book per tab session.
  const openReader = () => {
    setOpen(true);
    const key = `ptec.readeropen.book.${bookId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode — ping anyway.
    }
    recordReaderOpen("book", bookId).catch(() => {});
  };

  if (open) {
    return (
      <div className="overflow-hidden rounded-lg border border-divider bg-bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider bg-paper px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-text-heading">{title}</p>
            <p className="text-xs text-text-muted">{t("readOnline")}</p>
          </div>
          <div className="flex items-center gap-2">
            {fullReaderHref && (
              <Link
                href={fullReaderHref}
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{bookT("openFullReader")}</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-divider bg-bg-surface px-2.5 text-xs font-semibold text-text-muted transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label={t("close")}
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("close")}</span>
            </button>
          </div>
        </div>

        <PDFViewer
          title={title}
          pdfUrl={pdfUrl}
          bookId={bookId}
          totalPages={totalPages}
          initialProgressPct={initialProgressPct}
          initialMaxProgressPct={initialMaxProgressPct}
          allowDownload={allowDownload}
          isLoggedIn={isLoggedIn}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-divider bg-bg-surface px-5 py-8 text-center shadow-sm sm:px-8 sm:py-10">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/8 text-brand">
        <BookOpen className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-base font-bold text-text-heading">{t("readOnline")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
        {initialProgressPct > 0
          ? `${initialProgressPct}% ${bookT("complete")}`
          : t("readerLoadHint")}
      </p>
      <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={openReader}
          disabled={!pdfUrl}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {pdfUrl ? <BookOpen className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          {t("openReader")}
        </button>
        {fullReaderHref && (
          <Link
            href={fullReaderHref}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-divider bg-paper px-5 text-sm font-semibold text-text-heading transition hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:w-auto"
          >
            <ExternalLink className="h-4 w-4" />
            {bookT("openFullReader")}
          </Link>
        )}
      </div>
    </div>
  );
}
