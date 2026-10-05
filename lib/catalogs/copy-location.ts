/**
 * Where a record's copies are — from the COPIES, never the book-level
 * `shelf_location` (docs/CATALOG-REVIEW.md, Slice 3). Pure.
 *
 * Koha owns each copy's holding library and shelving location
 * (docs/KOHA-SYNC.md); the book-level field is an e-Library leftover that Koha
 * never syncs and that is empty on all 2,639 production records (2026-10-05).
 * Showing it as "the shelf" told a librarian nothing, and would tell them
 * something wrong the day one record had it set and its copies did not.
 *
 * Withdrawn copies are not anywhere a reader could go, so they are left out.
 * A copy with no location is still counted — under `shelf: null` — so the
 * summary says "5 copies, 2 with no shelf" rather than silently dropping them.
 */
import { normalizeCopyStatus } from "@/lib/catalog";

export type CopyForLocation = {
  status: string | null;
  shelf_location: string | null;
  holding_library?: string | null;
};

export type LocationGroup = {
  library: string | null;
  shelf: string | null;
  count: number;
  available: number;
};

const tidy = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export function copyLocations(copies: readonly CopyForLocation[] | null | undefined): LocationGroup[] {
  const groups = new Map<string, LocationGroup>();
  for (const c of copies ?? []) {
    const status = normalizeCopyStatus(c.status);
    if (status === "withdrawn") continue;
    const library = tidy(c.holding_library);
    const shelf = tidy(c.shelf_location);
    const key = `${library ?? ""}\u0000${shelf ?? ""}`;
    const g = groups.get(key) ?? { library, shelf, count: 0, available: 0 };
    g.count += 1;
    if (status === "available") g.available += 1;
    groups.set(key, g);
  }
  // Shelved groups first, then by size; a stable order for equal groups.
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.shelf !== null) - Number(a.shelf !== null) ||
      b.count - a.count ||
      (a.library ?? "").localeCompare(b.library ?? "") ||
      (a.shelf ?? "").localeCompare(b.shelf ?? ""),
  );
}

export const unshelvedCount = (groups: readonly LocationGroup[]) =>
  groups.filter((g) => g.shelf === null).reduce((n, g) => n + g.count, 0);
