"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  BookMarked, Plus, Trash2, Globe, Lock, ChevronRight,
  Pencil, Check, Loader2,
} from "lucide-react";
import {
  createReadingList, deleteReadingList, updateReadingList,
} from "@/app/actions/reading-lists";
import type { ReadingList } from "@/app/actions/reading-lists";

interface Props { initialLists: ReadingList[] }

function ListCard({ list, onDelete, onUpdate }: {
  list: ReadingList;
  onDelete: (id: string) => void;
  onUpdate: (id: string, name: string, isPublic: boolean) => void;
}) {
  const t = useTranslations("dashboard");
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(list.name);
  const [pub, setPub]         = useState(list.is_public);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Both handlers used to discard what the action returned and update local
  // state unconditionally, so a failed save or delete still redrew the card as
  // though it had worked — the list reappeared on the next load with no error
  // shown and nothing logged.
  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateReadingList(list.id, name.trim(), list.description ?? undefined, pub);
      if (res?.error) { setError(res.error); return; }
      onUpdate(list.id, name.trim(), pub);
      setEditing(false);
    } catch {
      // A Server Action can reject before it returns anything — a dropped
      // connection, a serialization failure. Without this the card keeps the
      // caller's optimistic state and stays disabled forever.
      setError(t("listsErrorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("listsDeleteConfirm", { name: list.name }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deleteReadingList(list.id);
      if (res?.error) { setError(res.error); return; }
      onDelete(list.id);
    } catch {
      setError(t("listsErrorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative rounded-2xl border border-divider bg-bg-surface p-4 transition-colors hover:border-brand/30">
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
          style={{
            background: "var(--ptec-danger-soft)",
            color: "var(--ptec-danger-text)",
            border: "1px solid var(--ptec-danger-line)",
          }}
        >
          {error}
        </p>
      )}
      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            maxLength={80}
            aria-label={t("listsNameLabel")}
            className="focus-field w-full rounded-lg border border-divider bg-paper px-3 py-2 text-base font-semibold text-text-body sm:text-[13.5px]"
          />
          <label className="flex items-center gap-2 text-[12.5px] text-text-muted cursor-pointer">
            <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} className="accent-brand" />
            {t("listsMakePublicShort")}
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy || !name.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-brand-contrast disabled:opacity-60">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Check className="h-3 w-3" aria-hidden="true" />} {t("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="rounded-lg border border-divider px-3 py-1.5 text-[12px] font-semibold text-text-muted hover:text-text-body">
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <Link href={`/lists/${list.id}`} className="min-w-0 flex-1 group/link">
              <h3 className="font-semibold text-[14px] text-text-heading group-hover/link:text-brand transition-colors truncate">
                {list.name}
              </h3>
              {list.description && (
                <p className="mt-0.5 text-[12px] text-text-muted line-clamp-2">{list.description}</p>
              )}
            </Link>
            {/* Revealed on hover for a mouse; ALWAYS shown on touch, where there
                is no hover — they were opacity-0 on every phone, so a list
                could not be renamed or deleted there at all. */}
            <div className="flex shrink-0 items-center gap-1 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100 motion-reduce:transition-none">
              <button type="button" onClick={() => setEditing(true)}
                aria-label={t("listsRename", { name: list.name })} title={t("listsRename", { name: list.name })}
                className="focus-field rounded-lg p-1.5 text-text-muted transition-colors hover:bg-paper hover:text-brand">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button type="button" onClick={handleDelete} disabled={busy}
                aria-label={t("listsDelete", { name: list.name })} title={t("listsDelete", { name: list.name })}
                className="focus-field rounded-lg p-1.5 text-text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-60">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-[12px] text-text-muted">
              <span>{t("listsItemCount", { count: list.book_count ?? 0 })}</span>
              <span className="flex items-center gap-1">
                {list.is_public
                  ? <><Globe className="h-3 w-3" aria-hidden="true" /> {t("listsPublic")}</>
                  : <><Lock className="h-3 w-3" aria-hidden="true" /> {t("listsPrivate")}</>
                }
              </span>
            </div>
            <Link href={`/lists/${list.id}`} tabIndex={-1} aria-hidden="true"
              className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-brand hover:opacity-80">
              {t("view")} <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReadingListsSection({ initialLists }: Props) {
  const t = useTranslations("dashboard");
  const [lists, setLists]   = useState<ReadingList[]>(initialLists);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newPub, setNewPub]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    setCreateError(null);
    try {
      const res = await createReadingList(newName.trim(), undefined, newPub);
      // A failed create used to fall straight through to the reset below: the
      // form cleared, the creator closed, no list appeared and nothing said
      // why. Keep the typed name so the reader can retry it.
      if (!res.success || !res.id) {
        setCreateError(res.error ?? t("listsErrorCreate"));
        return;
      }
      setLists((prev) => [{
        id: res.id!,
        user_id: "",
        name: newName.trim(),
        topic: null,
        description: null,
        is_public: newPub,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        book_count: 0,
      }, ...prev]);
      setNewName(""); setNewPub(false); setCreating(false);
    } catch {
      setCreateError(t("listsErrorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(id: string) {
    setLists((prev) => prev.filter((l) => l.id !== id));
  }

  function handleUpdate(id: string, name: string, isPublic: boolean) {
    setLists((prev) => prev.map((l) => l.id === id ? { ...l, name, is_public: isPublic } : l));
  }

  return (
    <div id="lists" className="scroll-mt-6">
      {/* The tab above already names this panel and counts it, so no second
          heading — only the action. */}
      {(lists.length > 0 || creating) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[13px] text-text-muted">{t("listsIntro")}</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="focus-field inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[13px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("listsNew")}
          </button>
        </div>
      )}

      {creating && (
        <div className="mb-4 rounded-2xl border border-surface-brand-line bg-surface-brand-soft p-4">
          <p id="create-list-title" className="mb-3 text-[13px] font-semibold text-text-heading">{t("listsCreateTitle")}</p>
          {createError && (
            <p
              role="alert"
              className="mb-3 rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
              style={{
                background: "var(--ptec-danger-soft)",
                color: "var(--ptec-danger-text)",
                border: "1px solid var(--ptec-danger-line)",
              }}
            >
              {createError}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
              placeholder={t("listsNamePlaceholder")}
              aria-labelledby="create-list-title"
              maxLength={80}
              className="focus-field w-full rounded-xl border border-divider bg-bg-surface px-3.5 py-2.5 text-base text-text-body sm:text-[13.5px]"
            />
            <label className="flex items-center gap-2 text-[12.5px] text-text-muted cursor-pointer">
              <input type="checkbox" checked={newPub} onChange={(e) => setNewPub(e.target.checked)} className="accent-brand" />
              {t("listsMakePublic")}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy || !newName.trim()}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[13px] font-bold text-brand-contrast disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                {t("listsCreate")}
              </button>
              <button type="button" onClick={() => { setCreating(false); setNewName(""); }}
                className="rounded-xl border border-divider bg-bg-surface px-4 py-2 text-[13px] font-semibold text-text-muted hover:text-text-body">
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {lists.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-12 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-brand-soft text-brand" aria-hidden="true">
            <BookMarked className="h-5 w-5" />
          </span>
          <p className="text-[14px] font-semibold text-text-heading">{t("listsEmptyTitle")}</p>
          <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-text-muted">{t("listsEmptyDesc")}</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="focus-field mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-[13px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("listsCreateFirst")}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} onDelete={handleDelete} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
