"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Bookmark, Check, Loader2, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";

/* Bookmarks. A row's name is, in order: the label the reader gave it, the
   nearest outline heading, or nothing — and the page number is always shown
   regardless, because it is the thing that is actually being pointed at.

   Labels are server-backed (0141) and therefore optional in a second sense:
   `canLabel` is false offline and for a signed-out reader, and the rename
   control is omitted rather than disabled there. Offering an action that
   cannot store what someone types is worse than not offering it. */
const ReaderBookmarks = memo(function ReaderBookmarks({
  bookmarks,
  currentPage,
  sectionFor,
  labelFor,
  canLabel,
  pending,
  error,
  onSelect,
  onRemove,
  onRename,
  onAddCurrent,
  fmt,
}: {
  bookmarks: number[];
  currentPage: number;
  sectionFor: (page: number) => string | null;
  labelFor: (page: number) => string | null;
  canLabel: boolean;
  pending: Set<number>;
  error: "save" | "remove" | "rename" | null;
  onSelect: (page: number) => void;
  onRemove: (page: number) => void;
  onRename: (page: number, label: string) => Promise<boolean>;
  onAddCurrent: () => void;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasCurrent = bookmarks.includes(currentPage);

  useEffect(() => {
    if (editing !== null) inputRef.current?.focus();
  }, [editing]);

  // A bookmark removed while its label was open leaves the editor pointing at
  // nothing.
  useEffect(() => {
    if (editing !== null && !bookmarks.includes(editing)) setEditing(null);
  }, [bookmarks, editing]);

  const startEdit = (page: number) => {
    setDraft(labelFor(page) ?? sectionFor(page) ?? "");
    setEditing(page);
  };

  const commit = async (page: number) => {
    setSaving(true);
    const ok = await onRename(page, draft);
    setSaving(false);
    // Only close on success: a failed rename must keep what was typed on
    // screen, so it can be retried rather than retyped.
    if (ok) setEditing(null);
  };

  return (
    <div>
      {error && (
        <p role="alert" className="reader-danger mb-2 px-2 text-[12px] leading-5">
          {t(
            error === "save"
              ? "bookmarkSaveError"
              : error === "remove"
                ? "bookmarkRemoveError"
                : "bookmarkRenameError",
          )}
        </p>
      )}

      {!hasCurrent && (
        <button type="button" onClick={onAddCurrent} className="reader-row mb-1 items-center">
          <Bookmark className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 font-semibold">{t("bookmarkAdd")}</span>
          <span className="reader-faint text-[11px] tabular-nums">{t("page")} {fmt(currentPage)}</span>
        </button>
      )}

      {bookmarks.length === 0 ? (
        <p className="reader-muted p-3 text-[13px] leading-6">{t("noBookmarks")}</p>
      ) : (
        <ul className="space-y-0.5">
          {bookmarks.map((p) => {
            const label = labelFor(p);
            const name = label ?? sectionFor(p);
            const busy = pending.has(p);

            if (editing === p) {
              return (
                <li key={p} className="flex items-center gap-1 px-1 py-1">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void commit(p); }
                      if (e.key === "Escape") { e.preventDefault(); setEditing(null); }
                    }}
                    maxLength={120}
                    aria-label={`${t("bookmarkRename")} — ${t("page")} ${fmt(p)}`}
                    className="reader-input min-w-0 flex-1"
                    placeholder={`${t("page")} ${fmt(p)}`}
                  />
                  <button
                    type="button"
                    onClick={() => void commit(p)}
                    disabled={saving}
                    aria-label={t("bookmarkRenameSave")}
                    className="reader-btn shrink-0"
                  >
                    {saving
                      ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                      : <Check className="h-4 w-4" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    aria-label={t("bookmarkRenameCancel")}
                    className="reader-btn shrink-0"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            }

            return (
              <li key={p} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  aria-current={p === currentPage ? "page" : undefined}
                  className="reader-row min-w-0 flex-1 items-center"
                >
                  <Bookmark className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{name ?? `${t("page")} ${fmt(p)}`}</span>
                    {name && <span className="reader-faint block text-[11px]">{t("page")} {fmt(p)}</span>}
                  </span>
                  <span className="reader-faint shrink-0 text-[11px] tabular-nums">{fmt(p)}</span>
                </button>
                {canLabel && (
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    aria-label={`${t("bookmarkRename")} — ${t("page")} ${fmt(p)}`}
                    className="reader-btn shrink-0"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(p)}
                  disabled={busy}
                  aria-label={`${t("bookmarkRemove")} — ${t("page")} ${fmt(p)}`}
                  className="reader-btn shrink-0"
                >
                  {busy
                    ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    : <X className="h-4 w-4" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default ReaderBookmarks;
