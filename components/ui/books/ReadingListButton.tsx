"use client";

import { useState, useEffect, useRef } from "react";
import { BookMarked, Plus, Check, ChevronDown, X, Loader2 } from "lucide-react";
import { getMyReadingLists, addBookToList, removeBookFromList, createReadingList } from "@/app/actions/reading-lists";
import type { ReadingList } from "@/app/actions/reading-lists";

interface Props {
  bookId: string;
  isLoggedIn: boolean;
  initialListIds?: string[];
}

export default function ReadingListButton({ bookId, isLoggedIn, initialListIds = [] }: Props) {
  const [open, setOpen]     = useState(false);
  const [lists, setLists]   = useState<ReadingList[]>([]);
  const [inLists, setInLists] = useState<Set<string>>(new Set(initialListIds));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy]     = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleOpen() {
    if (!isLoggedIn) { window.location.href = "/auth/login"; return; }
    setOpen((v) => !v);
    if (!open && lists.length === 0) {
      setLoading(true);
      const data = await getMyReadingLists();
      setLists(data);
      setLoading(false);
    }
  }

  async function toggle(listId: string) {
    setBusy(listId);
    if (inLists.has(listId)) {
      await removeBookFromList(listId, bookId);
      setInLists((s) => { const n = new Set(s); n.delete(listId); return n; });
    } else {
      const res = await addBookToList(listId, bookId);
      if (!res.error) setInLists((s) => new Set([...s, listId]));
    }
    setBusy(null);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy("new");
    const res = await createReadingList(newName.trim());
    if (res.success && res.id) {
      const fresh = await getMyReadingLists();
      setLists(fresh);
      await addBookToList(res.id, bookId);
      setInLists((s) => new Set([...s, res.id!]));
    }
    setNewName("");
    setCreating(false);
    setBusy(null);
  }

  const inAny = inLists.size > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-[14px] font-semibold transition-all ${
          inAny
            ? "border-brand bg-brand/10 text-brand"
            : "border-divider bg-paper text-text-body hover:border-brand/50 hover:text-brand"
        }`}
      >
        <BookMarked className="h-4 w-4" />
        {inAny ? `In ${inLists.size} list${inLists.size > 1 ? "s" : ""}` : "Add to List"}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-divider bg-bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <span className="text-[13px] font-bold text-text-heading">My Reading Lists</span>
            <button type="button" onClick={() => setOpen(false)} className="text-text-muted hover:text-text-body">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto py-1.5">
            {loading ? (
              <div className="flex justify-center py-5">
                <Loader2 className="h-5 w-5 animate-spin text-brand" />
              </div>
            ) : lists.length === 0 ? (
              <p className="px-4 py-3 text-[12.5px] text-text-muted">No lists yet. Create one below.</p>
            ) : (
              lists.map((list) => {
                const checked = inLists.has(list.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => toggle(list.id)}
                    disabled={busy === list.id}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-paper disabled:opacity-60"
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                      checked ? "border-brand bg-brand" : "border-divider bg-paper"
                    }`}>
                      {checked && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-text-body">{list.name}</p>
                      <p className="text-[11px] text-text-muted">{list.book_count ?? 0} books</p>
                    </div>
                    {busy === list.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-divider px-4 py-3">
            {creating ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                  placeholder="List name…"
                  maxLength={80}
                  className="flex-1 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12.5px] text-text-body focus:border-brand focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy === "new" || !newName.trim()}
                  className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
                >
                  {busy === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                </button>
                <button type="button" onClick={() => setCreating(false)} className="text-text-muted hover:text-text-body">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg py-1 text-[12.5px] font-semibold text-brand hover:opacity-80"
              >
                <Plus className="h-4 w-4" /> New List
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
