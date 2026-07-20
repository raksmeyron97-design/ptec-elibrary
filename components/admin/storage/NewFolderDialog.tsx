"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import StorageDialogShell from "./StorageDialogShell";

export default function NewFolderDialog({
  open,
  parentFolder,
  busy,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  /** '' means creating a new top-level category (rare — most admins create
   *  a subfolder inside one, shown here for context). */
  parentFolder: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const t = useTranslations("adminStorage.newFolder");
  const tCat = useTranslations("adminStorage.categories");
  const [name, setName] = useState("");
  const topCategory = parentFolder.split("/")[0];
  const parentLabel = parentFolder ? (tCat.has(topCategory) ? tCat(topCategory) : parentFolder) : null;

  return (
    <StorageDialogShell
      open={open}
      title={t("title")}
      busy={busy}
      onClose={() => { setName(""); onClose(); }}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body hover:bg-paper disabled:opacity-50">{t("cancel")}</button>
          <button
            type="button"
            onClick={() => name.trim() && onCreate(name.trim())}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("create")}
          </button>
        </>
      }
    >
      {parentLabel && <p className="mb-3 text-[12.5px] text-text-muted">{parentLabel}</p>}
      <label className="block text-sm font-semibold text-text-body" htmlFor="new-folder-name">{t("name")}</label>
      <input
        id="new-folder-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onCreate(name.trim()); }}
        className="mt-1.5 w-full rounded-lg border border-divider bg-bg-page px-3 py-2 text-sm text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
        maxLength={80}
      />
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </StorageDialogShell>
  );
}
