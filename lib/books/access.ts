// lib/books/access.ts
//
// One decision, one place: may this reader be handed the book's PDF file?
//
// The sibling of lib/publications/access.ts, deliberately the same shape. A
// book has no rights half — PTEC hosts the file it is being asked about, and
// the licence heuristic that gates a third party's journal article has no
// counterpart here — so this is the library-policy gate alone, and its result
// type stays compatible with the publication one so a caller reading both does
// not have to learn two vocabularies.
//
// Pure and browser-safe on purpose: the admin form, the book detail page, the
// search route and the download route all resolve through this, so a hidden
// button and a refused byte stream can never disagree about what the rule is.

/** The fields of a book row this decision actually reads. */
export interface BookDownloadAccessInput {
  /** Column from 0131. Undefined on a row read before the migration, or from a
   *  select that does not ask for it → treated as allowed, which is the
   *  column's default and the pre-0131 behaviour. */
  allow_download?: boolean | null;
  /** Column from 0131. The librarian's own words, shown to the reader. */
  download_disabled_reason?: string | null;
  /** Whether a file exists at all. */
  fileUrl?: string | null;
}

export type BookDownloadDenialReason =
  /** No PDF is attached — nothing to download, and nothing to read either. */
  | "no-file"
  /** The library has switched downloads off for this book. */
  | "policy";

export interface BookDownloadAccess {
  /** May the reader be given the file to keep? */
  canDownload: boolean;
  /** May the reader open it in the in-app viewer? */
  canReadOnline: boolean;
  /** Why not, when canDownload is false. Null when it is true. */
  reason: BookDownloadDenialReason | null;
  /** The librarian's custom explanation, when one was recorded and applies. */
  message: string | null;
}

/**
 * Resolve what a reader may do with this book's file.
 *
 * Online reading survives the policy denial — a read-online-only book is still
 * fully readable in the viewer, which is the whole point of distinguishing it
 * from a book whose file is missing.
 */
export function resolveBookDownloadAccess(book: BookDownloadAccessInput): BookDownloadAccess {
  if (!book.fileUrl) {
    return { canDownload: false, canReadOnline: false, reason: "no-file", message: null };
  }

  // Only an explicit false restricts. undefined (pre-migration row, or a select
  // that did not ask for the column) and null both mean "allowed" — the same
  // deterministic reading publications use, so a partial select can never
  // silently restrict a book the librarian never restricted.
  if (book.allow_download === false) {
    return {
      canDownload: false,
      canReadOnline: true,
      reason: "policy",
      message: book.download_disabled_reason?.trim() || null,
    };
  }

  return { canDownload: true, canReadOnline: true, reason: null, message: null };
}

/**
 * Narrow helper for the many call sites that hold only the flag and only need
 * the verdict — a search result deciding whether to offer a download link, a
 * metadata export deciding whether to publish a file URL.
 *
 * `hasFile` defaults to true because those callers have already established
 * that a file exists before asking.
 */
export function bookDownloadAllowed(
  allowDownload: boolean | null | undefined,
  hasFile = true,
): boolean {
  return resolveBookDownloadAccess({
    allow_download: allowDownload,
    fileUrl: hasFile ? "present" : null,
  }).canDownload;
}
