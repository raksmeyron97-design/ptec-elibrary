"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Smartphone, X, Download, Quote } from "lucide-react";

type Viewport = "desktop" | "mobile";

export default function ThesisPreview({
  title,
  authorNames,
  advisorName,
  program,
  cohort,
  academicYear,
  abstract,
  keywords,
  references,
  coverUrl,
  onClose,
}: {
  title: string;
  authorNames: string;
  advisorName: string;
  program: string;
  cohort: string;
  academicYear: string;
  abstract: string;
  keywords: string[];
  references: string[];
  coverUrl: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("adminThesisForm.preview");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const headingId = "thesis-preview-heading";
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3">
          <h2 id={headingId} className="text-sm font-bold text-text-heading">{t("heading")}</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-divider bg-paper p-0.5">
              <button type="button" onClick={() => setViewport("desktop")} aria-pressed={viewport === "desktop"} aria-label={t("desktop")} title={t("desktop")} className={`flex h-8 w-8 items-center justify-center rounded-md transition ${viewport === "desktop" ? "bg-brand text-white" : "text-text-muted hover:text-text-body"}`}>
                <Monitor className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setViewport("mobile")} aria-pressed={viewport === "mobile"} aria-label={t("mobile")} title={t("mobile")} className={`flex h-8 w-8 items-center justify-center rounded-md transition ${viewport === "mobile" ? "bg-brand text-white" : "text-text-muted hover:text-text-body"}`}>
                <Smartphone className="h-4 w-4" />
              </button>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-paper hover:text-text-heading">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto bg-paper p-4 sm:p-6">
          <div className={`mx-auto overflow-hidden rounded-xl bg-bg-surface shadow-sm transition-all ${viewport === "mobile" ? "max-w-[390px]" : "max-w-full"}`}>
            <div className={`flex gap-5 p-5 sm:p-8 ${viewport === "mobile" ? "flex-col" : ""}`}>
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="h-56 w-40 shrink-0 rounded-lg object-cover shadow-md" />
              ) : (
                <div className="h-56 w-40 shrink-0 rounded-lg border border-dashed border-divider bg-paper" />
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-[1.6] text-text-heading">{title || t("untitled")}</h1>
                <p className="mt-2 text-sm text-text-body">{authorNames || t("noAuthor")}</p>
                {advisorName && <p className="text-sm text-text-muted">{t("advisor", { name: advisorName })}</p>}
                <p className="mt-1 text-xs text-text-muted">
                  {program || t("noProgram")} · {cohort ? t("cohort", { cohort }) : t("noCohort")} · {academicYear || t("noYear")}
                </p>
                <div className="mt-4 flex gap-2">
                  <button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white opacity-60">
                    <Download className="h-3.5 w-3.5" /> {t("download")}
                  </button>
                  <button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body opacity-60">
                    <Quote className="h-3.5 w-3.5" /> {t("cite")}
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-divider p-5 sm:p-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t("abstract")}</h2>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.75] text-text-body">
                {abstract.trim() || t("nothingYet")}
              </p>

              {keywords.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {keywords.map((k) => (
                    <span key={k} className="rounded-full border border-divider bg-paper px-3 py-1 text-xs text-text-muted">{k}</span>
                  ))}
                </div>
              )}

              {references.filter(Boolean).length > 0 && (
                <div className="mt-8 border-t border-divider pt-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t("references")}</h2>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-text-body">
                    {references.filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
