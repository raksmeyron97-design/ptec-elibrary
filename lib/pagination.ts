/**
 * Shared "rows per page" options for the public listing pages (books,
 * catalogs, theses). Kept in one place so the selector in
 * `components/ui/core/Pagination.tsx` and the server pages agree on the
 * allowed sizes — an unlisted `?size=` value falls back to the default.
 */
export const PAGE_SIZE_OPTIONS = [18, 36, 72] as const;

export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

/** Coerce a raw `?size=` query value into one of the allowed page sizes. */
export function resolvePageSize(raw: string | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE;
}
