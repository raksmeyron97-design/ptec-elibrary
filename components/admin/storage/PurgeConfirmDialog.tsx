"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import StorageDialogShell from "./StorageDialogShell";
import type { StorageFile } from "@/lib/types/storage";

/** Permanent deletion needs more friction than an ordinary confirm dialog —
 *  typing the literal word DELETE, not just clicking a button — because it
 *  is the one storage action with no undo. */
export default function PurgeConfirmDialog({
  file,
  busy,
  onClose,
  onConfirm,
}: {
  file: StorageFile | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminStorage.purgeDialog");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => { setConfirmText(""); }, [file]);

  return (
    <StorageDialogShell open={!!file} title={t("title")} busy={busy} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body hover:bg-paper disabled:opacity-50">{t("cancel")}</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || confirmText.trim().toUpperCase() !== "DELETE"}
          className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("confirm")}
        </button>
      </>
    }>
      <p className="text-sm text-text-body">{t("body", { name: file?.originalName ?? "" })}</p>
      <label className="mt-4 block text-sm font-semibold text-text-body" htmlFor="purge-confirm-input">{t("confirmLabel")}</label>
      <input
        id="purge-confirm-input"
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={t("confirmPlaceholder")}
        autoComplete="off"
        className="mt-1.5 w-full rounded-lg border border-divider bg-bg-page px-3 py-2 text-sm text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
      />
      <p className="mt-3 text-[12px] text-text-muted">{t("restrictedNotice")}</p>
    </StorageDialogShell>
  );
}
