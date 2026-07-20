"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import StorageDialogShell from "./StorageDialogShell";
import type { StorageFile } from "@/lib/types/storage";

export default function RenameDialog({
  file,
  busy,
  error,
  onClose,
  onRename,
}: {
  file: StorageFile | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const t = useTranslations("adminStorage.rename");
  const [name, setName] = useState(file?.name ?? "");

  useEffect(() => { setName(file?.name ?? ""); }, [file]);

  return (
    <StorageDialogShell open={!!file} title={t("title")} busy={busy} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body hover:bg-paper disabled:opacity-50">{t("cancel")}</button>
        <button type="button" onClick={() => name.trim() && onRename(name.trim())} disabled={busy || !name.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60">
          {t("save")}
        </button>
      </>
    }>
      <label className="block text-sm font-semibold text-text-body" htmlFor="rename-name">{t("name")}</label>
      <input
        id="rename-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onRename(name.trim()); }}
        className="mt-1.5 w-full rounded-lg border border-divider bg-bg-page px-3 py-2 text-sm text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
        maxLength={200}
      />
      <p className="mt-2 text-[12.5px] text-text-muted">{t("note")}</p>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </StorageDialogShell>
  );
}
