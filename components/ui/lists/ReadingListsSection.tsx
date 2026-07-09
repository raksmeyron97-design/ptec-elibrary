"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import {
  BookMarked, Plus, Trash2, Globe, Lock, ChevronRight,
  Pencil, Check, X, Loader2,
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
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(list.name);
  const [pub, setPub]         = useState(list.is_public);
  const [busy, setBusy]       = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    await updateReadingList(list.id, name.trim(), list.description ?? undefined, pub);
    onUpdate(list.id, name.trim(), pub);
    setBusy(false);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${list.name}"? This cannot be undone.`)) return;
    setBusy(true);
    await deleteReadingList(list.id);
    onDelete(list.id);
  }

  return (
    <div className="group relative rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm transition hover:shadow-md">
      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            maxLength={80}
            className="w-full rounded-lg border border-divider bg-paper px-3 py-2 text-[13.5px] font-semibold text-text-body focus:border-brand focus:outline-none"
          />
          <label className="flex items-center gap-2 text-[12.5px] text-text-muted cursor-pointer">
            <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} className="accent-brand" />
            Make public (shareable link)
          </label>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !name.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
            </button>
            <button onClick={() => setEditing(false)}
              className="rounded-lg border border-divider px-3 py-1.5 text-[12px] font-semibold text-text-muted hover:text-text-body">
              Cancel
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
            <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(true)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-paper hover:text-brand transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleDelete} disabled={busy}
                className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-60 dark:hover:bg-red-900/20">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-[12px] text-text-muted">
              <span>{list.book_count ?? 0} books</span>
              <span className="flex items-center gap-1">
                {list.is_public
                  ? <><Globe className="h-3 w-3" /> Public</>
                  : <><Lock className="h-3 w-3" /> Private</>
                }
              </span>
            </div>
            <Link href={`/lists/${list.id}`}
              className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-brand hover:opacity-80">
              View <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReadingListsSection({ initialLists }: Props) {
  const [lists, setLists]   = useState<ReadingList[]>(initialLists);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newPub, setNewPub]     = useState(false);
  const [busy, setBusy]         = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    const res = await createReadingList(newName.trim(), undefined, newPub);
    if (res.success && res.id) {
      setLists((prev) => [{
        id: res.id!,
        user_id: "",
        name: newName.trim(),
        description: null,
        is_public: newPub,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        book_count: 0,
      }, ...prev]);
    }
    setNewName(""); setNewPub(false); setCreating(false); setBusy(false);
  }

  function handleDelete(id: string) {
    setLists((prev) => prev.filter((l) => l.id !== id));
  }

  function handleUpdate(id: string, name: string, isPublic: boolean) {
    setLists((prev) => prev.map((l) => l.id === id ? { ...l, name, is_public: isPublic } : l));
  }

  return (
    <div id="lists" className="scroll-mt-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-brand" />
          <h2 className="text-lg sm:text-xl font-bold text-text-heading">Reading Lists</h2>
          {lists.length > 0 && (
            <span className="ml-1 text-sm font-normal text-text-muted">({lists.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" /> New List
        </button>
      </div>

      {creating && (
        <div className="mb-4 rounded-2xl border border-brand/30 bg-brand/5 p-4">
          <p className="mb-3 text-[13px] font-semibold text-text-heading">Create a new list</p>
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
              placeholder="e.g. Research References, Semester 1…"
              maxLength={80}
              className="w-full rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13.5px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <label className="flex items-center gap-2 text-[12.5px] text-text-muted cursor-pointer">
              <input type="checkbox" checked={newPub} onChange={(e) => setNewPub(e.target.checked)} className="accent-brand" />
              Make public (anyone with the link can view)
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={busy || !newName.trim()}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create List
              </button>
              <button onClick={() => { setCreating(false); setNewName(""); }}
                className="rounded-xl border border-divider px-4 py-2 text-[13px] font-semibold text-text-muted hover:text-text-body">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {lists.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface py-10 text-center">
          <BookMarked className="mb-3 h-10 w-10 text-text-muted/30" />
          <p className="text-sm font-semibold text-text-heading">No reading lists yet</p>
          <p className="mt-1 text-[12.5px] text-text-muted">
            Organise your books into named collections like &ldquo;Semester 1&rdquo; or &ldquo;Research Refs&rdquo;
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" /> Create First List
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} onDelete={handleDelete} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
