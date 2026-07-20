"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CheckCircle2, XCircle, FolderCog, Archive, Trash2, Download, X } from "lucide-react";

export default function BulkThesisActionBar({
  count,
  busy,
  onPublish,
  onUnpublish,
  onChangeCohort,
  onChangeAcademicYear,
  onArchive,
  onDelete,
  onExportCsv,
  onClear,
}: {
  count: number;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onChangeCohort: (cohort: string) => void;
  onChangeAcademicYear: (year: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onExportCsv: () => void;
  onClear: () => void;
}) {
  const [cohortPickerOpen, setCohortPickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [cohortValue, setCohortValue] = useState("");
  const [yearValue, setYearValue] = useState("");
  const t = useTranslations("adminTheses.bulk");

  if (count === 0) return null;

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      role="toolbar"
      aria-label={t("toolbarLabel")}
      className="sticky top-[64px] z-20 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 shadow-sm"
    >
      <button
        type="button"
        onClick={onClear}
        aria-label={t("clearSelection")}
        className="flex h-7 w-7 items-center justify-center rounded-full text-brand hover:bg-brand/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="text-[13.5px] font-bold text-brand">
        {t("selected", { count })}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={busy} onClick={onPublish} className={btn}>
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("publish")}
        </button>
        <button type="button" disabled={busy} onClick={onUnpublish} className={btn}>
          <XCircle className="h-3.5 w-3.5" /> {t("unpublish")}
        </button>

        <div className="relative">
          <button
            type="button"
            disabled={busy}
            onClick={() => { setCohortPickerOpen((v) => !v); setYearPickerOpen(false); }}
            aria-haspopup="dialog"
            aria-expanded={cohortPickerOpen}
            className={btn}
          >
            <FolderCog className="h-3.5 w-3.5" /> {t("changeCohort")}
          </button>
          {cohortPickerOpen && (
            <div role="dialog" aria-label={t("changeCohort")} className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-divider bg-bg-surface p-3 shadow-xl">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted" htmlFor="bulk-cohort-value">{t("newCohort")}</label>
              <input
                id="bulk-cohort-value"
                type="text"
                value={cohortValue}
                onChange={(e) => setCohortValue(e.target.value)}
                placeholder="e.g. 4"
                className="h-9 w-full rounded-lg border border-divider bg-bg-surface px-2.5 text-sm text-text-body outline-none focus:border-brand"
              />
              <button
                type="button"
                disabled={!cohortValue.trim()}
                onClick={() => { onChangeCohort(cohortValue.trim()); setCohortPickerOpen(false); setCohortValue(""); }}
                className="mt-2 w-full rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {t("applyTo", { count })}
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            disabled={busy}
            onClick={() => { setYearPickerOpen((v) => !v); setCohortPickerOpen(false); }}
            aria-haspopup="dialog"
            aria-expanded={yearPickerOpen}
            className={btn}
          >
            <FolderCog className="h-3.5 w-3.5" /> {t("changeYear")}
          </button>
          {yearPickerOpen && (
            <div role="dialog" aria-label={t("changeYear")} className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-divider bg-bg-surface p-3 shadow-xl">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted" htmlFor="bulk-year-value">{t("newYear")}</label>
              <input
                id="bulk-year-value"
                type="text"
                value={yearValue}
                onChange={(e) => setYearValue(e.target.value)}
                placeholder="e.g. 2023-2024"
                className="h-9 w-full rounded-lg border border-divider bg-bg-surface px-2.5 text-sm text-text-body outline-none focus:border-brand"
              />
              <button
                type="button"
                disabled={!yearValue.trim()}
                onClick={() => { onChangeAcademicYear(yearValue.trim()); setYearPickerOpen(false); setYearValue(""); }}
                className="mt-2 w-full rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {t("applyTo", { count })}
              </button>
            </div>
          )}
        </div>

        <button type="button" disabled={busy} onClick={onExportCsv} className={btn}>
          <Download className="h-3.5 w-3.5" /> {t("exportCsv")}
        </button>
        <button type="button" disabled={busy} onClick={onArchive} className={btn}>
          <Archive className="h-3.5 w-3.5" /> {t("archive")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t("delete")}
        </button>
      </div>
    </div>
  );
}
