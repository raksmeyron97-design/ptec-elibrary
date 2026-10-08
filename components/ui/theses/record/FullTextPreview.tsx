"use client";

// The "Full text" section of the record page: the in-page reader, closed
// until somebody asks for it.
//
// A thesis PDF is tens of megabytes, so the viewer mounts only on an explicit
// request — this slot, or "Read online" in the access panel or the phone dock,
// which reach it over lib/theses/reader-bus.ts. It mounts only when the
// viewer's access says `canRead` (lib/theses/access.ts), which is the file
// route's own inline rule, so a reader is never opened onto a 401 or 403.
//
// The page lists this section only where a reader COULD be served the text:
// a protected record and a record with no PDF explain themselves in the access
// panel instead of in an empty slot. The slot's own action is secondary — the
// access panel carries the page's one primary verb.
//
// Analytics: `recordReaderOpen` is called with "research_report", the content
// type this table actually is.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, Lock, LogIn } from "lucide-react";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import { recordReaderOpen } from "@/app/actions/reader-events";
import { landingEntryClass } from "@/lib/analytics/entry-class";
import { onThesisReaderOpen } from "@/lib/theses/reader-bus";
import type { ThesisAccess } from "@/lib/theses/access";
import { useThesisAccess } from "./useThesisAccess";
import { BUTTON_SECONDARY } from "./styles";

export default function FullTextPreview({
  reportId,
  title,
  recordAccess,
  signInHref,
  reportEmail,
}: {
  reportId: string;
  title: string;
  recordAccess: ThesisAccess;
  signInHref: string;
  reportEmail?: string | null;
}) {
  const t = useTranslations("thesisDetail");
  const tReader = useTranslations("reader");
  const { access, pending } = useThesisAccess(reportId, recordAccess);
  const [open, setOpen] = useState(false);
  const canRead = access.canRead;

  const openReader = useCallback(() => {
    if (!canRead) return;
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
    recordReaderOpen("research_report", reportId, landingEntryClass()).catch(() => {});
  }, [reportId, canRead]);

  useEffect(() => onThesisReaderOpen(openReader), [openReader]);

  if (open) {
    return (
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <PDFViewer
          title={title}
          pdfUrl={`/api/theses/${reportId}/file`}
          bookId={reportId}
          totalPages={100}
          initialProgressPct={0}
          initialMaxProgressPct={0}
          // The viewer's own download would fetch the file route and bypass
          // the download gate; the access panel's Download PDF is the only
          // save path.
          allowDownload={false}
          reportEmail={reportEmail}
        />
      </div>
    );
  }

  const protectedNow = access.state === "protected";

  return (
    <div className="mt-4 grid items-center gap-5 rounded-xl bg-paper p-4 sm:grid-cols-[96px_minmax(0,1fr)]">
      {/* A drawn page, not a thumbnail: rendering a real one means fetching
          the PDF, which is the exact cost this slot defers. */}
      <div
        aria-hidden="true"
        className="hidden aspect-[1/1.414] content-start gap-[5px] rounded-sm border border-border bg-bg-surface px-2.5 py-3 shadow-sm sm:grid"
      >
        <span className="mx-auto mb-1.5 block h-[3px] w-2/5 rounded-sm bg-border-strong" />
        {[100, 100, 80, 100, 60, 100, 100, 80].map((w, i) => (
          <span key={i} className="block h-[3px] rounded-sm bg-border" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-[22px] text-text-heading">
          {protectedNow ? t("accessProtectedTitle") : t("fullTextAvailable")}
        </p>
        <p className="mt-1 max-w-[56ch] text-[13.5px] leading-5 text-text-muted">
          {protectedNow ? t("fullTextProtected") : canRead ? t("readerLoadHint") : tReader("signInToReadHint")}
        </p>
        <div className="mt-3">
          {pending ? (
            <span aria-hidden="true" className="skeleton block h-11 w-40 rounded-lg" />
          ) : canRead ? (
            <button type="button" onClick={openReader} className={BUTTON_SECONDARY}>
              <BookOpen aria-hidden="true" />
              {tReader("openReader")}
            </button>
          ) : protectedNow ? (
            <span className="inline-flex items-center gap-2 text-[13px] text-text-muted">
              <Lock className="h-4 w-4" aria-hidden="true" />
              {t("fullTextSeePanel")}
            </span>
          ) : (
            <a href={signInHref} className={BUTTON_SECONDARY}>
              <LogIn aria-hidden="true" />
              {tReader("signInToRead")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
