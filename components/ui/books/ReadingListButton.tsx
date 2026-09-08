"use client";

import { useState, useEffect, useRef } from "react";
import { BookMarked, Plus, Check, ChevronDown, X, Loader2 } from "lucide-react";
import {
  getMyReadingLists,
  getListsContainingItem,
  addItemToList,
  removeItemFromList,
  createReadingList,
} from "@/app/actions/reading-lists";
import type { ReadingList, ResourceRecordType } from "@/app/actions/reading-lists";
import { useSession } from "@/components/providers/SessionProvider";

/**
 * Add a resource to one or more research collections.
 *
 * WHICH COLLECTIONS ALREADY HOLD IT is loaded when the menu opens, not
 * assumed from a prop. `initialListIds` is an optimisation for the book detail
 * page, which resolves it server-side; every OTHER mount — theses and
 * publications, through ActionButtons — passed nothing, so the menu opened
 * with every collection unticked no matter what was in them. Clicking an
 * already-saved collection then inserted a duplicate, hit the unique index
 * (0136), came back `already_in_list`, and the handler's `if (!res.error)`
 * dropped it: no tick appeared, no message appeared, and the control read as
 * broken. It was not broken — it was correctly refusing a duplicate and
 * failing to say so.
 */
interface Props {
  /** Any published resource — a collection holds all three types. */
  recordId: string;
  recordType?: ResourceRecordType;
  /** Omit to read the viewer from context, which is what lets this mount on
   *  pages that render anonymously and hydrate the session in afterwards. */
  isLoggedIn?: boolean;
  initialListIds?: string[];
  className?: string;
}

export default function ReadingListButton({
  recordId,
  recordType = "book",
  isLoggedIn: isLoggedInProp,
  initialListIds = [],
  className,
}: Props) {
  const { user } = useSession();
  const isLoggedIn = isLoggedInProp ?? !!user;
  const [open, setOpen]     = useState(false);
  const [lists, setLists]   = useState<ReadingList[]>([]);
  const [inLists, setInLists] = useState<Set<string>>(new Set(initialListIds));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy]     = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
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
    if (open) return;
    setError(null);
    // Membership is re-read on every open, even when the lists are cached:
    // the resource may have been saved or removed from another tab, or from
    // the collection page, since this menu last ran.
    setLoading(true);
    const [data, containing] = await Promise.all([
      lists.length === 0 ? getMyReadingLists() : Promise.resolve(lists),
      getListsContainingItem(recordType, recordId),
    ]);
    setLists(data);
    setInLists(new Set(containing));
    setLoading(false);
  }

  async function toggle(listId: string) {
    setBusy(listId);
    setError(null);
    if (inLists.has(listId)) {
      const res = await removeItemFromList(listId, recordType, recordId);
      if (res.error) setError(res.error);
      else setInLists((s) => { const n = new Set(s); n.delete(listId); return n; });
    } else {
      const res = await addItemToList(listId, recordType, recordId);
      // `already_in_list` is the unique index doing its job: the resource is
      // in this collection exactly once, which is the state the reader asked
      // for. Tick it rather than reporting a failure — a duplicate save is a
      // no-op, not an error the reader has to understand.
      if (!res.error || res.error === "already_in_list") {
        setInLists((s) => new Set([...s, listId]));
      } else {
        setError(res.error);
      }
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
      const added = await addItemToList(res.id, recordType, recordId);
      // The collection exists either way; only tick it if the resource
      // actually went in, so the menu cannot claim a save that did not happen.
      if (!added.error || added.error === "already_in_list") {
        setInLists((s) => new Set([...s, res.id!]));
      } else {
        setError(added.error);
      }
    } else if (res.error) {
      setError(res.error);
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
        className={
          className ??
          `inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-[14px] font-semibold transition-all ${
            inAny
              ? "border-brand bg-brand/10 text-brand"
              : "border-divider bg-paper text-text-body hover:border-brand/50 hover:text-brand"
          }`
        }
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

          {error && (
            <p role="alert" className="border-b border-divider px-4 py-2 text-[12px] leading-5 text-danger">
              {error}
            </p>
          )}

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
                  className="focus-field flex-1 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12.5px] text-text-body"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy === "new" || !newName.trim()}
                  className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-brand-contrast disabled:opacity-60"
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
