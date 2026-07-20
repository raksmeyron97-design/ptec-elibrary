"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UploadCloud, X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { STORAGE_CATEGORIES } from "@/lib/types/storage";
import { formatBytes } from "@/lib/admin/storage-shared";
import { uploadStorageFilesAction } from "@/app/actions/storage";

type QueueItem = {
  key: string;
  file: File;
  status: "pending" | "uploading" | "success" | "failed";
  error?: string;
  possibleDuplicate?: boolean;
};

const MAX_FILES = 10;

export default function UploadDialog({
  open,
  defaultFolder,
  onClose,
  onUploaded,
}: {
  open: boolean;
  defaultFolder: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const t = useTranslations("adminStorage.upload");
  const tCat = useTranslations("adminStorage.categories");
  const inputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [folder, setFolder] = useState(defaultFolder && (STORAGE_CATEGORIES as readonly string[]).includes(defaultFolder) ? defaultFolder : STORAGE_CATEGORIES[0]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFolder(defaultFolder && (STORAGE_CATEGORIES as readonly string[]).includes(defaultFolder) ? defaultFolder : STORAGE_CATEGORIES[0]);
    setQueue([]);
    setSubmitting(false);
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addFiles = useCallback((files: FileList | File[]) => {
    setQueue((prev) => {
      const next = [...prev];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_FILES) break;
        next.push({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, status: "pending" });
      }
      return next;
    });
  }, []);

  function removeFile(key: string) {
    setQueue((prev) => prev.filter((f) => f.key !== key));
  }

  async function submit() {
    const pending = queue.filter((f) => f.status === "pending" || f.status === "failed");
    if (pending.length === 0) return;
    setSubmitting(true);
    setQueue((prev) => prev.map((f) => (pending.some((p) => p.key === f.key) ? { ...f, status: "uploading", error: undefined } : f)));

    const result = await uploadStorageFilesAction(folder, pending.map((f) => f.file));
    setSubmitting(false);

    if (!result.ok) {
      setQueue((prev) => prev.map((f) => (pending.some((p) => p.key === f.key) ? { ...f, status: "failed", error: result.error.message } : f)));
      return;
    }

    setQueue((prev) => {
      const next = [...prev];
      result.data.forEach((r, i) => {
        const target = pending[i];
        if (!target) return;
        const idx = next.findIndex((f) => f.key === target.key);
        if (idx === -1) return;
        next[idx] = {
          ...next[idx],
          status: r.success ? "success" : "failed",
          error: r.error?.message,
          possibleDuplicate: !!r.possibleDuplicate,
        };
      });
      return next;
    });

    if (result.data.some((r) => r.success)) onUploaded();
  }

  if (!open) return null;

  const successCount = queue.filter((f) => f.status === "success").length;
  const failedCount = queue.filter((f) => f.status === "failed").length;
  const allDone = queue.length > 0 && queue.every((f) => f.status === "success" || f.status === "failed");
  const hasPending = queue.some((f) => f.status === "pending");

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !submitting && onClose()} role="dialog" aria-modal="true" aria-label={t("title")}>
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-divider px-6 py-4">
          <h2 className="text-lg font-bold text-text-heading">{t("title")}</h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label={t("close")} className="rounded-full p-1 text-text-muted hover:bg-paper hover:text-text-heading disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <label htmlFor={`${inputId}-folder`} className="block text-sm font-semibold text-text-body">{t("destination")}</label>
          <select
            id={`${inputId}-folder`}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={submitting}
            className="mt-1.5 w-full rounded-lg border border-divider bg-bg-page px-3 py-2 text-sm text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
          >
            {STORAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{tCat(c)}</option>
            ))}
          </select>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            role="button"
            tabIndex={0}
            aria-label={t("dropHint")}
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${dragActive ? "border-brand bg-brand/5" : "border-divider hover:border-brand/50"}`}
          >
            <UploadCloud className="h-8 w-8 text-text-muted" aria-hidden="true" />
            <p className="text-sm font-medium text-text-body">{t("dropHint")}</p>
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          {queue.length > 0 && (
            <>
              <p className="mt-4 text-[12.5px] font-semibold text-text-muted">{t("selected", { count: queue.length })}</p>
              <ul className="mt-2 space-y-1.5">
                {queue.map((item) => (
                  <li key={item.key} className="flex items-center gap-2.5 rounded-lg border border-divider px-3 py-2">
                    <span className="shrink-0">
                      {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
                      {item.status === "success" && <CheckCircle2 className="h-4 w-4 text-success" />}
                      {item.status === "failed" && <XCircle className="h-4 w-4 text-danger" />}
                      {item.status === "pending" && <span className="block h-4 w-4 rounded-full border-2 border-divider" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text-body">{item.file.name}</span>
                      <span className="block text-[11.5px] text-text-muted">
                        {formatBytes(item.file.size)}
                        {item.status === "failed" && item.error ? ` · ${item.error}` : ""}
                        {item.status === "success" && item.possibleDuplicate ? ` · ${t("possibleDuplicate")}` : ""}
                      </span>
                    </span>
                    {item.status !== "uploading" && (
                      <button type="button" onClick={() => removeFile(item.key)} aria-label={t("removeFile")} className="rounded p-1 text-text-muted hover:bg-paper hover:text-danger">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {allDone && (
            <p className={`mt-3 text-[13px] font-semibold ${failedCount > 0 ? "text-warning" : "text-success"}`}>
              {failedCount === 0 ? t("successAll", { count: successCount }) : successCount === 0 ? t("failedAll") : t("successPartial", { success: successCount, total: queue.length, failed: failedCount })}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-divider px-6 py-4">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body hover:bg-paper disabled:opacity-50">
            {allDone ? t("close") : t("cancel")}
          </button>
          {!allDone && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !hasPending}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? t("uploading") : `${t("uploadButton")}${queue.length ? ` (${queue.length})` : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
