"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import StorageDialogShell from "./StorageDialogShell";
import type { StorageFile } from "@/lib/types/storage";
import { STORAGE_CATEGORIES } from "@/lib/types/storage";
import { resolveStorageFileUsageAction } from "@/app/actions/storage";

export default function MoveDialog({
  file,
  busy,
  error,
  onClose,
  onMove,
}: {
  file: StorageFile | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onMove: (destinationFolder: string) => void;
}) {
  const t = useTranslations("adminStorage.move");
  const tCat = useTranslations("adminStorage.categories");
  const [destination, setDestination] = useState(file?.folder.split("/")[0] ?? STORAGE_CATEGORIES[0]);
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [usageChecked, setUsageChecked] = useState(true);

  useEffect(() => {
    if (!file) return;
    setDestination(file.folder.split("/")[0] ?? STORAGE_CATEGORIES[0]);
    setUsageCount(null);
    let alive = true;
    resolveStorageFileUsageAction(file.storageKey).then((res) => {
      if (!alive) return;
      if (res.ok) { setUsageCount(res.data.refs.length); setUsageChecked(res.data.checkedAllSources); }
      else { setUsageCount(null); setUsageChecked(false); }
    });
    return () => { alive = false; };
  }, [file]);

  return (
    <StorageDialogShell open={!!file} title={t("title")} busy={busy} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body hover:bg-paper disabled:opacity-50">{t("cancel")}</button>
        <button type="button" onClick={() => onMove(destination)} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60">
          {t("move")}
        </button>
      </>
    }>
      <label className="block text-sm font-semibold text-text-body" htmlFor="move-destination">{t("destination")}</label>
      <select
        id="move-destination"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-divider bg-bg-page px-3 py-2 text-sm text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
      >
        {STORAGE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{tCat(c)}</option>
        ))}
      </select>

      {usageCount !== null && usageCount > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-[12.5px] text-text-body">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {t("usageWarning", { count: usageCount })}
        </p>
      )}
      {!usageChecked && (
        <p className="mt-3 text-[12px] text-text-muted">{t("usageUnknown")}</p>
      )}
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
    </StorageDialogShell>
  );
}
