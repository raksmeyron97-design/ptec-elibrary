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

/**
 * The file policy a book is published under (0151).
 *
 *   public          read online, download, quote, harvest   (the default)
 *   read_online     the viewer only; no file is handed over (0131's `false`)
 *   catalogue_only  the bibliographic record stands and NO public route
 *                   serves the bytes — no reader, no download, no
 *                   citation_pdf_url, no OAI fileUrl, and the text may not
 *                   ground an AI answer
 *
 * `allow_download` is MIRRORED from this by a database trigger and must never
 * be written directly. Reading it is still correct everywhere it is already
 * read; it simply cannot express the third state.
 */
export type BookFileAccess = "public" | "read_online" | "catalogue_only";

export const BOOK_FILE_ACCESS_VALUES: readonly BookFileAccess[] = [
  "public",
  "read_online",
  "catalogue_only",
];

/**
 * An unrecognised or absent value reads as `public`.
 *
 * The same deterministic reading `allow_download` has had since 0131: a row
 * from before the migration, or a select that did not ask for the column,
 * must degrade to today's behaviour rather than silently restricting a book
 * a librarian never restricted. A partial select is a bug in the caller, not
 * a reason to withdraw a book.
 */
export function toBookFileAccess(raw: unknown): BookFileAccess {
  return BOOK_FILE_ACCESS_VALUES.includes(raw as BookFileAccess)
    ? (raw as BookFileAccess)
    : "public";
}

/** The fields of a book row this decision actually reads. */
export interface BookDownloadAccessInput {
  /** Column from 0151. The authoritative policy; absent => public. */
  file_access?: string | null;
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
  | "policy"
  /**
   * The library distributes no file for this book at all (0151). Distinct
   * from "policy" because the reader is told something different: not "you
   * may read but not keep it", but "we hold the record, not the file".
   */
  | "catalogue-only";

export interface BookDownloadAccess {
  /** May the reader be given the file to keep? */
  canDownload: boolean;
  /** May the reader open it in the in-app viewer? */
  canReadOnline: boolean;
  /**
   * May ANY public route stream these bytes — the viewer's fetch included?
   *
   * The distinction `canReadOnline` cannot make: a read-online book still
   * streams, a catalogue-only book streams to nobody. The file route asks
   * THIS, and asks it before any storage call.
   */
  canServeBytes: boolean;
  /**
   * May this book's extracted text be quoted, cited by page, or used to
   * ground an AI answer, and may "found inside" page hits be shown?
   *
   * The record itself stays searchable and recommendable by title — it is in
   * the library. What stops is republishing its contents.
   */
  canQuoteText: boolean;
  /** May the reader keep a copy on the device for offline reading? */
  canSaveOffline: boolean;
  /**
   * May a machine be told where the file is — citation_pdf_url, OAI fileUrl,
   * a metadata export's format field?
   */
  canAdvertiseFile: boolean;
  /** The policy this decision was taken under. */
  fileAccess: BookFileAccess;
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
  const fileAccess = toBookFileAccess(book.file_access);
  const message = book.download_disabled_reason?.trim() || null;

  if (!book.fileUrl) {
    return {
      canDownload: false,
      canReadOnline: false,
      canServeBytes: false,
      canQuoteText: false,
      canSaveOffline: false,
      canAdvertiseFile: false,
      fileAccess,
      reason: "no-file",
      message: null,
    };
  }

  // The library distributes no file for this book. Everything that could put
  // the bytes, or the words inside them, in front of somebody is off — and
  // that is decided here rather than at each call site, so a drawn button, a
  // served stream and a quoted passage cannot disagree.
  if (fileAccess === "catalogue_only") {
    return {
      canDownload: false,
      canReadOnline: false,
      canServeBytes: false,
      canQuoteText: false,
      canSaveOffline: false,
      canAdvertiseFile: false,
      fileAccess,
      reason: "catalogue-only",
      message,
    };
  }

  // Only an explicit restriction restricts. `allow_download === false` is
  // still honoured directly: a select that asked for the legacy column and
  // not the new one must keep working, and the trigger guarantees the two
  // agree in the database.
  if (fileAccess === "read_online" || book.allow_download === false) {
    return {
      canDownload: false,
      canReadOnline: true,
      canServeBytes: true,
      canQuoteText: true,
      canSaveOffline: false,
      canAdvertiseFile: false,
      fileAccess: fileAccess === "public" ? "read_online" : fileAccess,
      reason: "policy",
      message,
    };
  }

  return {
    canDownload: true,
    canReadOnline: true,
    canServeBytes: true,
    canQuoteText: true,
    canSaveOffline: true,
    canAdvertiseFile: true,
    fileAccess,
    reason: null,
    message: null,
  };
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
