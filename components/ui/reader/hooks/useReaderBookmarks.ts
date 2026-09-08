"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addReaderBookmark,
  removeReaderBookmark,
  setReaderBookmarkLabel,
  syncReaderBookmarks,
  type ReaderBookmark,
} from "@/app/actions/reader-bookmarks";
import type { ResourceRecordType } from "@/app/actions/reading-lists";
import { loadBookmarkRecord, saveBookmarkRecord } from "../reader-config";

/**
 * Bookmarks for the open document: instant on this device, durable on the
 * account.
 *
 * LOCAL-FIRST, and that ordering is the design rather than an optimisation.
 * A bookmark is a one-tap action taken mid-sentence, so it must land in the
 * same frame; and the offline reader has no server to reach at all, but must
 * still let someone mark a page in a book they downloaded. So `localStorage`
 * stays the working set and the write path, exactly as before, and the server
 * (0141) is layered underneath it:
 *
 *   • on mount, signed in, the device's pages are pushed up and the merged
 *     server set comes back — which is what carries the bookmarks an existing
 *     reader already has into their account, without asking them to do
 *     anything or telling them it happened. The device record is STAMPED with
 *     the account it belongs to, and the server refuses to upload pages
 *     stamped for somebody else: a lab machine has one localStorage and many
 *     readers, so without that check the next student to sign in would absorb
 *     the previous student's bookmarks. `lib/offline.ts` stamps downloaded
 *     books the same way, for the same reason;
 *   • every toggle updates local state immediately and reports to the server
 *     after, never before;
 *   • a rejected server write ROLLS THE LOCAL STATE BACK, because a bookmark
 *     that shows in the panel and does not exist in the account is the failure
 *     this whole change exists to remove. The one exception is the offline
 *     reader, which never talks to the server and where local IS the truth.
 *
 * Labels are server-only: naming a page is a considered act, not a one-tap
 * one, and a label typed offline has nowhere to go. The panel falls back to
 * the nearest outline heading and then the page number, as it always did.
 */
export function useReaderBookmarks({
  recordId,
  recordType = "book",
  isLoggedIn,
}: {
  recordId: string;
  recordType?: ResourceRecordType;
  /** Already `prop && !offline` at the call site, so the offline reader is
      purely local by construction. */
  isLoggedIn: boolean;
}) {
  const [pages, setPages] = useState<number[]>(() => loadBookmarkRecord(recordId).pages);
  /** The account this device's record belongs to; null until the first sync,
      and for a signed-out or offline reader. */
  const [ownerKey, setOwnerKey] = useState<string | null>(
    () => loadBookmarkRecord(recordId).owner,
  );
  const [labels, setLabels] = useState<Map<number, string>>(() => new Map());
  const [ids, setIds] = useState<Map<number, string>>(() => new Map());
  const [error, setError] = useState<"save" | "remove" | "rename" | null>(null);
  const [syncing, setSyncing] = useState(false);
  /** Pages with a server call in flight — a second tap must not race it. */
  const [pending, setPending] = useState<Set<number>>(() => new Set());

  const sortPages = (next: number[]) => [...new Set(next)].sort((a, b) => a - b);

  /* The device copy is written on every change, including changes that came
     FROM the server: it is what the offline reader and the next cold start
     read, so it must not fall behind the account. */
  useEffect(() => {
    saveBookmarkRecord(recordId, { owner: ownerKey, pages });
  }, [pages, ownerKey, recordId]);

  const applyServer = useCallback((rows: ReaderBookmark[]) => {
    setPages(sortPages(rows.map((r) => r.page_number)));
    setLabels(new Map(rows.flatMap((r) => (r.label ? [[r.page_number, r.label] as const] : []))));
    setIds(new Map(rows.map((r) => [r.page_number, r.id] as const)));
  }, []);

  /* First sync: push this device's pages up, take the merged set back. */
  const migratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoggedIn) return;
    const key = `${recordType}:${recordId}`;
    if (migratedRef.current === key) return;
    migratedRef.current = key;

    const local = loadBookmarkRecord(recordId);
    let cancelled = false;
    setSyncing(true);
    syncReaderBookmarks(recordType, recordId, local.pages, local.owner)
      .then(({ ownerKey: owner, bookmarks }) => {
        if (cancelled) return;
        // Order matters: claim the record for this account BEFORE writing the
        // pages, so the persistence effect above cannot store another
        // account's stamp alongside this account's bookmarks.
        setOwnerKey(owner);
        applyServer(bookmarks);
      })
      // A failed sync leaves the device's bookmarks alone and visible. They
      // are not lost; they are simply not yet in the account, and the next
      // time the reader opens this document the sync runs again.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, recordId, recordType, applyServer]);

  // `toggle` closes over `pages`; `remove` reads the same list through a ref
  // so it does not take a dependency that would rebuild every consumer of it
  // on each page turn.
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const toggle = useCallback(
    async (page: number) => {
      if (page < 1 || pending.has(page)) return;
      const had = pages.includes(page);
      const previous = pages;

      // Local first: the panel and the toolbar reflect the tap immediately.
      setPages((prev) => (had ? prev.filter((p) => p !== page) : sortPages([...prev, page])));
      setError(null);
      if (!isLoggedIn) return;

      setPending((s) => new Set(s).add(page));
      try {
        const res = had
          ? await removeReaderBookmark(recordType, recordId, page)
          : await addReaderBookmark(recordType, recordId, page);

        if (!res.success) {
          setPages(previous);
          setError(had ? "remove" : "save");
          return;
        }
        if (!had && "bookmark" in res && res.bookmark) {
          const created = res.bookmark;
          setIds((m) => new Map(m).set(page, created.id));
        }
        if (had) {
          setIds((m) => {
            const next = new Map(m);
            next.delete(page);
            return next;
          });
          setLabels((m) => {
            const next = new Map(m);
            next.delete(page);
            return next;
          });
        }
      } catch {
        setPages(previous);
        setError(had ? "remove" : "save");
      } finally {
        setPending((s) => {
          const next = new Set(s);
          next.delete(page);
          return next;
        });
      }
    },
    [pages, pending, isLoggedIn, recordId, recordType],
  );

  /** Explicit removal from the panel's ✕. Distinct from `toggle` because it
      must never ADD one: the panel's remove control acting as an add on a
      stale page list is a bookmark appearing where one was deleted. */
  const remove = useCallback(
    (page: number) => {
      if (pagesRef.current.includes(page)) void toggle(page);
    },
    [toggle],
  );

  /** Name a bookmarked page, or clear its name with an empty string. */
  const rename = useCallback(
    async (page: number, label: string): Promise<boolean> => {
      const id = ids.get(page);
      // No server row means no label: an offline or unsynced bookmark has
      // nowhere to keep one, and pretending otherwise loses what was typed.
      if (!isLoggedIn || !id) {
        setError("rename");
        return false;
      }
      const previous = labels;
      const trimmed = label.trim();
      setLabels((m) => {
        const next = new Map(m);
        if (trimmed) next.set(page, trimmed);
        else next.delete(page);
        return next;
      });
      setError(null);
      try {
        const res = await setReaderBookmarkLabel(id, trimmed);
        if (!res.success) {
          setLabels(previous);
          setError("rename");
          return false;
        }
        return true;
      } catch {
        setLabels(previous);
        setError("rename");
        return false;
      }
    },
    [ids, labels, isLoggedIn],
  );

  const labelFor = useCallback((page: number) => labels.get(page) ?? null, [labels]);
  const canLabel = useMemo(() => isLoggedIn, [isLoggedIn]);

  return {
    bookmarks: pages,
    labelFor,
    canLabel,
    pending,
    syncing,
    error,
    clearError: useCallback(() => setError(null), []),
    toggle,
    remove,
    rename,
  };
}
