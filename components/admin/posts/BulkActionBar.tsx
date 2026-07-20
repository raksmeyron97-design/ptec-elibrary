"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle, Tag, Archive, Trash2, X } from "lucide-react";
import { CATEGORIES } from "@/lib/admin/posts-shared";

export default function BulkActionBar({
  count,
  busy,
  onPublish,
  onUnpublish,
  onChangeCategory,
  onArchive,
  onDelete,
  onClear,
}: {
  count: number;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onChangeCategory: (category: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("adminPosts.bulk");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

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
            onClick={() => setCategoryPickerOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={categoryPickerOpen}
            className={btn}
          >
            <Tag className="h-3.5 w-3.5" /> {t("changeCategory")}
          </button>
          {categoryPickerOpen && (
            <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="menuitem"
                  onClick={() => { setCategoryPickerOpen(false); onChangeCategory(c); }}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-text-body hover:bg-paper"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

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
