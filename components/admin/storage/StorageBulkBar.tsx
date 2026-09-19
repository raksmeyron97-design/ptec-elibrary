"use client";

import { useTranslations } from "next-intl";
import { Download, Trash2, X } from "lucide-react";

/**
 * The selection bar.
 *
 * It replaces a banner whose only control was "Clear selection" — so ticking
 * checkboxes across a folder led nowhere, and selection was a feature with no
 * verb attached. Two verbs now, and they are the two the storage API can
 * actually perform in bulk: download and trash.
 *
 * Writes are drawn only when the server would allow them (`canWrite`, which is
 * `storage.upload` resolved by the route guard). Download stays available at
 * read level, because reading a file you can already open is the same act.
 *
 * It renders as a live region rather than appearing and disappearing silently:
 * a bar that materialises on the third tick is easy to miss entirely.
 */
export default function StorageBulkBar({
  count,
  busy,
  canWrite,
  onDownload,
  onTrash,
  onClear,
}: {
  count: number;
  busy: boolean;
  canWrite: boolean;
  onDownload: () => void;
  onTrash: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("adminStorage.bulk");

  if (count === 0) return null;

  const action =
    "focus-field inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      role="region"
      aria-label={t("selectedRegion")}
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-surface-brand-line bg-surface-brand-soft px-3 py-2"
    >
      <span className="text-sm font-semibold text-text-heading" aria-live="polite">
        {t("selected", { count })}
      </span>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className={`${action} text-text-body hover:bg-bg-surface`}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("download")}
        </button>

        {canWrite && (
          <button
            type="button"
            onClick={onTrash}
            disabled={busy}
            className={`${action} text-danger-text hover:bg-danger-soft`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {busy ? t("working") : t("trash")}
          </button>
        )}

        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className={`${action} text-text-muted hover:bg-bg-surface`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {t("clearSelection")}
        </button>
      </div>
    </div>
  );
}
