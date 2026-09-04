"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { usePathname } from "next/navigation";
import { BookOpen, ExternalLink, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import { recordReaderOpen } from "@/app/actions/reader-events";
import type { ReaderCitationSource } from "@/components/ui/reader/ReaderCitation";

type PDFReaderLauncherProps = {
  title: string;
  pdfUrl?: string | null;
  bookId: string;
  totalPages?: number;
  initialProgressPct?: number;
  initialMaxProgressPct?: number;
  initialProgressAt?: string | null;
  allowDownload?: boolean;
  isLoggedIn?: boolean;
  fullReaderHref?: string;
  /** Published support address for the broken-file report link. */
  reportEmail?: string | null;
  /** When true, an anonymous reader is prompted to sign in instead of opening
   *  the viewer — the file API for this resource requires authentication. */
  requireAuthToView?: boolean;
  /** Bibliographic metadata for the in-reader "Cite this book"; null when the
   *  record cannot support a citation. */
  citation?: ReaderCitationSource | null;
};

export default function PDFReaderLauncher({
  title,
  pdfUrl,
  bookId,
  totalPages = 0,
  initialProgressPct = 0,
  initialMaxProgressPct = 0,
  initialProgressAt = null,
  allowDownload = true,
  isLoggedIn = false,
  fullReaderHref,
  reportEmail,
  requireAuthToView = false,
  citation = null,
}: PDFReaderLauncherProps) {
  const t = useTranslations("reader");
  const bookT = useTranslations("bookDetail");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const gated = requireAuthToView && !isLoggedIn;

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
      <PDFViewer
        title={title}
        pdfUrl={pdfUrl}
        bookId={bookId}
        totalPages={totalPages}
        initialProgressPct={initialProgressPct}
        initialMaxProgressPct={initialMaxProgressPct}
        initialProgressAt={initialProgressAt}
        allowDownload={allowDownload}
        isLoggedIn={isLoggedIn}
        reportEmail={reportEmail}
        onClose={() => setOpen(false)}
        fullReaderHref={fullReaderHref ? (locale === "km" ? `/km${fullReaderHref}` : fullReaderHref) : undefined}
        citation={citation}
      />
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-divider bg-bg-surface px-5 py-8 text-center shadow-sm sm:px-8 sm:py-10">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/8 text-brand">
        <BookOpen className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-base font-bold text-text-heading">{t("readOnline")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">
        {gated
          ? t("signInToReadHint")
          : initialProgressPct > 0
            ? `${initialProgressPct}% ${bookT("complete")}`
            : t("readerLoadHint")}
      </p>
      <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
        {gated ? (
          <a
            href={`/auth/login?callbackUrl=${encodeURIComponent(pathname)}`}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:w-auto"
          >
            <BookOpen className="h-4 w-4" />
            {t("signInToRead")}
          </a>
        ) : (
          <button
            type="button"
            onClick={openReader}
            disabled={!pdfUrl}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {pdfUrl ? <BookOpen className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
            {t("openReader")}
          </button>
        )}
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
