"use client";

import { useEffect } from "react";
import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";

const AUTO_DISMISS_MS = 9000;

/* "Welcome back": shown AFTER the reader has already been positioned at the
   resumed page, so nothing here can overwrite a position — it explains the
   jump and offers the one alternative, starting over. Dismisses itself. */
export default function ReaderContinuePrompt({
  page,
  onContinue,
  onRestart,
  fmt,
}: {
  page: number;
  onContinue: () => void;
  onRestart: () => void;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  useEffect(() => {
    const id = window.setTimeout(onContinue, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [onContinue]);
  return (
    <div
      data-reader-overlay
      role="status"
      aria-live="polite"
      className="reader-surface absolute left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl border p-3 shadow-2xl"
      style={{ bottom: "calc(var(--reader-inset-bottom) + 0.75rem)" }}
    >
      <div className="flex items-start gap-3">
        <span className="reader-accent-soft mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--reader-accent-soft)" }}>
          <BookOpen className="reader-accent h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-5">{t("welcomeBack")}</p>
          <p className="reader-muted text-[12.5px] leading-5">{t("continueFrom", { page: fmt(page) })}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onContinue} className="reader-btn reader-btn--primary flex-1">
          {t("continueReading")}
        </button>
        <button type="button" onClick={onRestart} className="reader-btn reader-btn--outline flex-1">
          {t("startFromBeginning")}
        </button>
      </div>
    </div>
  );
}
