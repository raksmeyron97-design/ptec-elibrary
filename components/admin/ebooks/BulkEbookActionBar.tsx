"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle, FolderCog, Tag, Archive, Trash2, Download, X } from "lucide-react";
import type { EbookOption } from "@/lib/admin/ebooks-shared";

/**
 * Floating selection bar.
 *
 * It used to sit above the table as a sticky banner, which pushed the rows
 * down the moment you ticked a box — the list moved under the cursor that was
 * still selecting. As a dark bar pinned to the bottom of the viewport it
 * overlays instead of reflowing, and it reads as a mode ("6 selected, now
 * choose an action") rather than another toolbar.
 *
 * Rendered *after* the list so `bottom` sticky has somewhere to travel from;
 * it returns null when nothing is selected, so it costs no layout space.
 */
export default function BulkEbookActionBar({
  count,
  busy,
  departments,
  onPublish,
  onUnpublish,
  onChangeDepartment,
  onAddTag,
  onArchive,
  onDelete,
  onExportCsv,
  onClear,
}: {
  count: number;
  busy: boolean;
  departments: EbookOption[];
  onPublish: () => void;
  onUnpublish: () => void;
  onChangeDepartment: (departmentId: string) => void;
  onAddTag: (tag: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onExportCsv: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("adminEbooks.bulk");
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [deptValue, setDeptValue] = useState("");
  const [tagValue, setTagValue] = useState("");

  if (count === 0) return null;

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-white/80 transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
  const popover =
    "admin-pop absolute bottom-full right-0 z-30 mb-2 w-56 rounded-xl border border-divider bg-bg-surface p-3 shadow-xl";
  const popoverLabel = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted";
  const popoverApply =
    "mt-2 w-full rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast transition-colors duration-150 hover:bg-brand-hover disabled:opacity-50";

  return (
    <div className="sticky bottom-4 z-30 flex justify-center">
      <div
        role="toolbar"
        aria-label={t("toolbarLabel")}
        className="admin-pop flex max-w-full flex-wrap items-center gap-1 rounded-xl bg-blue-950 px-3 py-2 shadow-lg"
      >
        <span className="pl-1 pr-2 text-[13px] font-semibold tabular-nums text-white" aria-live="polite">
          {t("selected", { count })}
        </span>

        <span className="mr-1 h-5 w-px bg-white/15" aria-hidden="true" />

        <button type="button" disabled={busy} onClick={onPublish} className={btn}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("publish")}
        </button>
        <button type="button" disabled={busy} onClick={onUnpublish} className={btn}>
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t("unpublish")}
        </button>

        <div className="relative">
          <button
            type="button"
            disabled={busy}
            onClick={() => { setDeptPickerOpen((v) => !v); setTagPickerOpen(false); }}
            aria-haspopup="dialog"
            aria-expanded={deptPickerOpen}
            className={btn}
          >
            <FolderCog className="h-3.5 w-3.5" aria-hidden="true" /> {t("changeDept")}
          </button>
          {deptPickerOpen && (
            <div role="dialog" aria-label={t("changeDept")} className={popover}>
              <label className={popoverLabel} htmlFor="bulk-dept-value">{t("newDept")}</label>
              <select
                id="bulk-dept-value"
                value={deptValue}
                onChange={(e) => setDeptValue(e.target.value)}
                className="focus-field h-9 w-full rounded-lg border border-divider bg-bg-surface px-2.5 text-sm text-text-body"
              >
                <option value="">{t("choose")}</option>
                {departments.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!deptValue}
                onClick={() => { onChangeDepartment(deptValue); setDeptPickerOpen(false); setDeptValue(""); }}
                className={popoverApply}
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
            onClick={() => { setTagPickerOpen((v) => !v); setDeptPickerOpen(false); }}
            aria-haspopup="dialog"
            aria-expanded={tagPickerOpen}
            className={btn}
          >
            <Tag className="h-3.5 w-3.5" aria-hidden="true" /> {t("addTag")}
          </button>
          {tagPickerOpen && (
            <div role="dialog" aria-label={t("addTag")} className={popover}>
              <label className={popoverLabel} htmlFor="bulk-tag-value">{t("tag")}</label>
              <input
                id="bulk-tag-value"
                type="text"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder={t("tagPlaceholder")}
                className="focus-field h-9 w-full rounded-lg border border-divider bg-bg-surface px-2.5 text-sm text-text-body"
              />
              <button
                type="button"
                disabled={!tagValue.trim()}
                onClick={() => { onAddTag(tagValue.trim()); setTagPickerOpen(false); setTagValue(""); }}
                className={popoverApply}
              >
                {t("applyTo", { count })}
              </button>
            </div>
          )}
        </div>

        <button type="button" disabled={busy} onClick={onExportCsv} className={btn}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> {t("exportCsv")}
        </button>
        <button type="button" disabled={busy} onClick={onArchive} className={btn}>
          <Archive className="h-3.5 w-3.5" aria-hidden="true" /> {t("archive")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-red-300 transition-colors duration-150 hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("delete")}
        </button>

        <span className="mx-1 h-5 w-px bg-white/15" aria-hidden="true" />

        <button
          type="button"
          onClick={onClear}
          aria-label={t("clearSelection")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
