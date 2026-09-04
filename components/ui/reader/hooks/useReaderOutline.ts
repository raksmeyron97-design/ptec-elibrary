"use client";

import { useCallback, useEffect, useState } from "react";
import { flattenOutline, type FlatOutlineEntry, type OutlineNode } from "@/lib/reader/outline";

type OutlinePdf = {
  getOutline: () => Promise<unknown>;
  getDestination: (name: string) => Promise<unknown>;
  // `never` so react-pdf's own `(ref: RefProxy)` signature is assignable.
  getPageIndex: (ref: never) => Promise<number>;
};

/**
 * The document outline, flattened and numbered, with each entry's page
 * resolved in the background (yielding every few entries so a 400-heading
 * textbook never blocks the main thread). Resolved pages are what make
 * "current section" and section-labelled bookmarks possible.
 */
export function useReaderOutline(pdf: OutlinePdf | null) {
  const [entries, setEntries] = useState<FlatOutlineEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!pdf) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntries([]);
      return;
    }
    (async () => {
      let flat: FlatOutlineEntry[] = [];
      try {
        const raw = (await pdf.getOutline()) as OutlineNode[] | null;
        if (cancelled) return;
        flat = flattenOutline(raw);
        setEntries(flat);
      } catch {
        if (!cancelled) setEntries([]);
        return;
      }
      // Resolve destinations to pages, in small batches.
      const resolved = flat.map((e) => ({ ...e }));
      let dirty = false;
      for (let i = 0; i < resolved.length; i++) {
        if (cancelled) return;
        const entry = resolved[i];
        try {
          const explicit =
            typeof entry.dest === "string" ? await pdf.getDestination(entry.dest) : entry.dest;
          if (Array.isArray(explicit) && explicit.length) {
            const idx = await pdf.getPageIndex(explicit[0] as never);
            entry.page = idx + 1;
            dirty = true;
          }
        } catch {
          /* unresolvable entry stays null */
        }
        if (i % 8 === 7 && dirty) {
          if (cancelled) return;
          setEntries(resolved.map((e) => ({ ...e })));
          dirty = false;
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (!cancelled && dirty) setEntries(resolved.map((e) => ({ ...e })));
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  /** Page for an entry, resolving on demand when the background pass has not
      reached it yet. */
  const resolvePage = useCallback(
    async (entry: FlatOutlineEntry): Promise<number | null> => {
      if (entry.page) return entry.page;
      if (!pdf || !entry.dest) return null;
      try {
        const explicit =
          typeof entry.dest === "string" ? await pdf.getDestination(entry.dest) : entry.dest;
        if (!Array.isArray(explicit) || !explicit.length) return null;
        return (await pdf.getPageIndex(explicit[0] as never)) + 1;
      } catch {
        return null;
      }
    },
    [pdf],
  );

  return { entries, resolvePage };
}
