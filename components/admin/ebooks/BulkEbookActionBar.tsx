"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, FolderCog, Tag, Archive, Trash2, Download, X } from "lucide-react";
import type { EbookOption } from "@/lib/admin/ebooks-shared";

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
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [deptValue, setDeptValue] = useState("");
  const [tagValue, setTagValue] = useState("");

  if (count === 0) return null;

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      role="toolbar"
      aria-label="Bulk e-book actions"
      className="sticky top-[64px] z-20 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 shadow-sm"
    >
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="flex h-7 w-7 items-center justify-center rounded-full text-brand hover:bg-brand/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="text-[13.5px] font-bold text-brand" aria-live="polite">
        {count} e-book{count !== 1 ? "s" : ""} selected
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={busy} onClick={onPublish} className={btn}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Publish
        </button>
        <button type="button" disabled={busy} onClick={onUnpublish} className={btn}>
          <XCircle className="h-3.5 w-3.5" /> Unpublish
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
            <FolderCog className="h-3.5 w-3.5" /> Change department
          </button>
          {deptPickerOpen && (
            <div role="dialog" aria-label="Change department" className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-divider bg-bg-surface p-3 shadow-xl">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted" htmlFor="bulk-dept-value">New department</label>
              <select
                id="bulk-dept-value"
                value={deptValue}
                onChange={(e) => setDeptValue(e.target.value)}
                className="h-9 w-full rounded-lg border border-divider bg-bg-surface px-2.5 text-sm text-text-body outline-none focus:border-brand"
              >
                <option value="">Choose…</option>
                {departments.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!deptValue}
                onClick={() => { onChangeDepartment(deptValue); setDeptPickerOpen(false); setDeptValue(""); }}
                className="mt-2 w-full rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                Apply to {count} e-book{count !== 1 ? "s" : ""}
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
            <Tag className="h-3.5 w-3.5" /> Add tag
          </button>
          {tagPickerOpen && (
            <div role="dialog" aria-label="Add tag" className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-divider bg-bg-surface p-3 shadow-xl">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted" htmlFor="bulk-tag-value">Tag</label>
              <input
                id="bulk-tag-value"
                type="text"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder="e.g. reviewed"
                className="h-9 w-full rounded-lg border border-divider bg-bg-surface px-2.5 text-sm text-text-body outline-none focus:border-brand"
              />
              <button
                type="button"
                disabled={!tagValue.trim()}
                onClick={() => { onAddTag(tagValue.trim()); setTagPickerOpen(false); setTagValue(""); }}
                className="mt-2 w-full rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                Apply to {count} e-book{count !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>

        <button type="button" disabled={busy} onClick={onExportCsv} className={btn}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
        <button type="button" disabled={busy} onClick={onArchive} className={btn}>
          <Archive className="h-3.5 w-3.5" /> Archive
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}
