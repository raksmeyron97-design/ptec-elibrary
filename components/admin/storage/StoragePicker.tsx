"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FolderOpen, Search, X, Check } from "lucide-react";
import type { StorageFile } from "@/lib/types/storage";
import { searchStorageFilesAction } from "@/app/actions/storage";
import { formatBytes, truncateMiddle } from "@/lib/admin/storage-shared";
import StorageTypeIcon from "./StorageTypeIcon";

/**
 * Reusable "Choose from Storage" picker for existing content-authoring forms
 * (team photos, book covers, post images, ...). Deliberately does NOT try to
 * refactor every upload workflow — it's a self-contained button + dialog
 * that a form drops in next to its existing "Upload new file" control and
 * wires to a single onSelect(file) callback. See TeamForm.tsx for the first
 * integration.
 */
export default function StoragePicker({
  folder,
  acceptExtensions,
  onSelect,
  triggerClassName,
  triggerLabel,
}: {
  /** Restrict search to one category, or omit to search everywhere. */
  folder?: string;
  /** e.g. ["jpg","jpeg","png","webp","avif","gif"] for image-only fields. */
  acceptExtensions?: string[];
  onSelect: (file: StorageFile) => void;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const t = useTranslations("adminStorage.picker");
  const tStates = useTranslations("adminStorage.states");
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StorageFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestGen = useRef(0);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const gen = ++requestGen.current;
    setLoading(true);
    const handle = setTimeout(async () => {
      const res = await searchStorageFilesAction({ q: q.trim() || undefined, folder, status: "active", limit: 60 });
      if (gen !== requestGen.current) return;
      setLoading(false);
      if (!res.ok) {
        if (res.error.code === "FORBIDDEN") setForbidden(true);
        setResults([]);
        return;
      }
      const filtered = acceptExtensions?.length
        ? res.data.items.filter((f) => acceptExtensions.includes(f.extension.toLowerCase()))
        : res.data.items;
      setResults(filtered);
    }, q ? 300 : 0);
    return () => clearTimeout(handle);
  }, [open, q, folder, acceptExtensions]);

  function confirm() {
    const file = results?.find((f) => f.storageKey === selectedKey);
    if (!file) return;
    onSelect(file);
    setOpen(false);
    setQ("");
    setSelectedKey(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setForbidden(false); }}
        className={triggerClassName ?? "inline-flex items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3 py-2 text-[13px] font-semibold text-text-body shadow-sm transition hover:bg-paper"}
      >
        <FolderOpen className="h-4 w-4" /> {triggerLabel ?? t("chooseExisting")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={t("title")}>
          <div ref={dialogRef} onClick={(e) => e.stopPropagation()} className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-divider px-5 py-4">
              <h2 className="text-lg font-bold text-text-heading">{t("title")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 text-text-muted hover:bg-paper hover:text-text-heading">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-divider p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                <input
                  id={inputId}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full rounded-lg border border-divider bg-bg-page py-2 pl-9 pr-3 text-sm text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {forbidden ? (
                <p className="p-6 text-center text-sm text-text-muted">{tStates("forbidden")}</p>
              ) : loading ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-paper" />)}
                </div>
              ) : !results || results.length === 0 ? (
                <p className="p-6 text-center text-sm text-text-muted">{t("noMatches")}</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {results.map((file) => {
                    const isImage = ["jpg", "jpeg", "png", "webp", "avif", "gif"].includes(file.extension.toLowerCase());
                    const isSelected = selectedKey === file.storageKey;
                    return (
                      <button
                        type="button"
                        key={file.storageKey}
                        onClick={() => setSelectedKey(file.storageKey)}
                        onDoubleClick={confirm}
                        className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition ${isSelected ? "border-brand ring-2 ring-brand/30" : "border-divider hover:border-brand/40"}`}
                      >
                        {isSelected && (
                          <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        <span className="flex aspect-square items-center justify-center bg-paper">
                          {isImage && file.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={file.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <StorageTypeIcon type="file" extension={file.extension} className="h-8 w-8 text-text-muted" />
                          )}
                        </span>
                        <span className="p-1.5">
                          <span className="block truncate text-[11px] font-medium text-text-body">{truncateMiddle(file.originalName, 18)}</span>
                          <span className="block text-[10px] text-text-muted">{formatBytes(file.size)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-divider px-5 py-4">
              <span className="text-[12.5px] text-text-muted">{selectedKey ? t("selected") : ""}</span>
              <div className="flex gap-3">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body hover:bg-paper">{t("cancel")}</button>
                <button type="button" onClick={confirm} disabled={!selectedKey} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60">
                  {t("select")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
