/* Outline (table of contents) helpers — pure.

   pdf.js hands the reader a tree of { title, dest, items }. The panel wants a
   flat, numbered list with depth (for indentation), and once each entry's
   destination has been resolved to a page, "the section the reader is in" is
   the last entry whose page is ≤ the current page. Bookmarks borrow the same
   lookup to label a page with its nearest heading. */

export type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineNode[];
};

export type FlatOutlineEntry = {
  /** Stable id: the path of indices from the root, e.g. "0.2.1". */
  id: string;
  title: string;
  depth: number;
  /** "01", "02", … for top-level entries; "" for nested ones. */
  number: string;
  dest: OutlineNode["dest"];
  /** Resolved page, filled in asynchronously; null until resolved or unresolvable. */
  page: number | null;
};

export function flattenOutline(nodes: OutlineNode[] | null | undefined): FlatOutlineEntry[] {
  const out: FlatOutlineEntry[] = [];
  const walk = (items: OutlineNode[], depth: number, prefix: string) => {
    items.forEach((node, i) => {
      const id = prefix ? `${prefix}.${i}` : String(i);
      out.push({
        id,
        title: (node.title || "").trim() || "—",
        depth,
        number: depth === 0 ? String(i + 1).padStart(2, "0") : "",
        dest: node.dest ?? null,
        page: null,
      });
      if (node.items?.length) walk(node.items, depth + 1, id);
    });
  };
  walk(nodes ?? [], 0, "");
  return out;
}

/** Index into `entries` of the section containing `page`, or -1. Entries whose
    page is unknown are skipped; a page before the first heading is in no section. */
export function currentSectionIndex(entries: FlatOutlineEntry[], page: number): number {
  let best = -1;
  let bestPage = -1;
  for (let i = 0; i < entries.length; i++) {
    const p = entries[i].page;
    if (p === null || p > page) continue;
    // Later entries on the same page win: they are the more specific heading.
    if (p >= bestPage) {
      best = i;
      bestPage = p;
    }
  }
  return best;
}

/** Title of the nearest heading at or before `page`, or null. */
export function sectionTitleForPage(entries: FlatOutlineEntry[], page: number): string | null {
  const i = currentSectionIndex(entries, page);
  return i === -1 ? null : entries[i].title;
}
