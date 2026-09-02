// ─────────────────────────────────────────────────────────────────────────────
// Device-local offline library.
//
// TWO STORES, ON PURPOSE:
//   • localStorage  — the RECORD (title, author, cover, which URL holds the
//                     bytes). Small, synchronous, readable before paint.
//   • Cache Storage — the BYTES. Never localStorage: a 20 MB PDF does not fit
//                     in a 5 MB synchronous string store, and Cache Storage is
//                     the only place the service worker can read from.
//
// THE CONTRACT. A book counts as "saved offline" only once the bytes are in
// Cache Storage AND a read-back of that cache entry succeeded. `cache.add()`
// resolving is not evidence — that was the old bug: the button said "Saved
// Offline" while the entry could be absent, evicted, or an HTML error page.
// downloadOfflineBook() below writes the localStorage record LAST, after
// verification, so a record can never outlive its bytes by construction.
//
// OWNERSHIP (shared devices). Each record carries the id of the account that
// saved it, and the device remembers the last account that used the offline
// library. When a DIFFERENT account signs in, reconcileOfflineOwnership()
// destroys the previous account's downloads — bytes and record. Sign-out alone
// destroys nothing: the same reader signing back in keeps their books. See
// docs/PWA-OFFLINE-READING.md §Privacy.
//
// This module is browser-only in effect but import-safe on the server: every
// entry point returns an empty/neutral value when `window` or `caches` is
// missing, so it can be imported from a component that is server-rendered.
// ─────────────────────────────────────────────────────────────────────────────

import { CACHES } from "@/lib/sw-policy";

/** Bumped when the record shape changes. v1 records (no `version`) are
 *  migrated on read by `normalizeRecord`. */
export const OFFLINE_SCHEMA_VERSION = 2;

/** Cap on how many books one device keeps. Reaching it is an explicit error the
 *  user resolves by removing something — the old code silently evicted the
 *  oldest download, which is user content disappearing with no notice. */
export const MAX_OFFLINE_BOOKS = 20;

/** Refuse absurd files rather than OOM the tab mid-download. Well above any
 *  book in this collection (largest measured: ~60 MB). */
export const MAX_OFFLINE_BOOK_BYTES = 400 * 1024 * 1024;

const OFFLINE_STORAGE_KEY = "ptec_offline_books";
/** The account that last used the offline library on this device. */
const OFFLINE_OWNER_KEY = "ptec_offline_owner";

export type OfflineBook = {
  /** Book id as the file API takes it: `/api/books/<id>/file`. */
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  coverColor?: string;
  /** The bare URL an online reader would request. */
  pdfUrl: string;
  /** The exact URL the bytes are stored under (`…/file?offline=1`). */
  cachedPdfUrl: string;
  /** Verified byte length, or null when the browser would not tell us. */
  sizeBytes: number | null;
  savedAt: number;
  /** Profile id of the account that saved it. null = pre-v2 record. */
  ownerKey: string | null;
  version: number;
};

/** What a caller must supply to save a book; everything else is derived. */
export type OfflineBookInput = {
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  coverColor?: string;
  pdfUrl: string;
  ownerKey: string | null;
};

/** Honest lifecycle. There is no "35%" state that isn't backed by real bytes:
 *  `downloading` carries receivedBytes/totalBytes, and totalBytes is null when
 *  the server sent no Content-Length. */
export type OfflineSaveStatus =
  | "idle"
  | "preparing"
  | "downloading"
  | "saving"
  | "verifying"
  | "saved"
  | "error";

export type OfflineSaveProgress = {
  status: OfflineSaveStatus;
  receivedBytes: number;
  /** null when the server sent no Content-Length — show a spinner, not a bar. */
  totalBytes: number | null;
};

export type OfflineSaveErrorCode =
  | "unsupported"
  | "limit"
  | "network"
  | "server"
  | "empty"
  | "too-large"
  | "quota"
  | "storage"
  | "verify"
  | "aborted";

export class OfflineSaveError extends Error {
  readonly code: OfflineSaveErrorCode;
  constructor(code: OfflineSaveErrorCode, message?: string) {
    super(message ?? code);
    this.name = "OfflineSaveError";
    this.code = code;
  }
}

/* ── Environment guards ──────────────────────────────────────────────────── */

export function isOfflineStorageSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof caches !== "undefined" &&
    "caches" in window
  );
}

function hasLocalStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage;
  } catch {
    return false; // storage blocked (private mode / policy)
  }
}

/* ── URL shapes ──────────────────────────────────────────────────────────── */

/**
 * The URL the bytes are STORED under.
 *
 * `?offline=1` is the consent marker: it distinguishes "the user pressed Save"
 * from "someone opened the reader", and app/sw.ts refuses to write book files
 * automatically at all. The reader asks for the bare URL, so every lookup and
 * delete uses `ignoreSearch: true` to bridge the two.
 */
export function offlineCacheUrl(pdfUrl: string): string {
  if (!pdfUrl) return pdfUrl;
  if (/[?&]offline=1(&|$)/.test(pdfUrl)) return pdfUrl;
  return `${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}offline=1`;
}

/* ── Records ─────────────────────────────────────────────────────────────── */

function normalizeRecord(raw: unknown): OfflineBook | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.pdfUrl !== "string" || !r.pdfUrl) return null;

  return {
    id: r.id,
    slug: typeof r.slug === "string" ? r.slug : r.id,
    title: typeof r.title === "string" ? r.title : "Untitled",
    author: typeof r.author === "string" ? r.author : "",
    coverUrl: typeof r.coverUrl === "string" ? r.coverUrl : null,
    coverColor: typeof r.coverColor === "string" ? r.coverColor : undefined,
    pdfUrl: r.pdfUrl,
    cachedPdfUrl:
      typeof r.cachedPdfUrl === "string" && r.cachedPdfUrl
        ? r.cachedPdfUrl
        : offlineCacheUrl(r.pdfUrl),
    sizeBytes: typeof r.sizeBytes === "number" && r.sizeBytes >= 0 ? r.sizeBytes : null,
    savedAt: typeof r.savedAt === "number" ? r.savedAt : Date.now(),
    ownerKey: typeof r.ownerKey === "string" ? r.ownerKey : null,
    version: typeof r.version === "number" ? r.version : 1,
  };
}

function readRecords(): OfflineBook[] {
  if (!hasLocalStorage()) return [];
  try {
    const data = window.localStorage.getItem(OFFLINE_STORAGE_KEY);
    if (!data) return [];
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: OfflineBook[] = [];
    for (const entry of parsed) {
      const rec = normalizeRecord(entry);
      if (!rec || seen.has(rec.id)) continue; // last write wins is wrong here:
      seen.add(rec.id); // the first record is the oldest-written, keep one only
      out.push(rec);
    }
    return out;
  } catch {
    return []; // corrupt metadata reads as an empty library, never a crash
  }
}

function writeRecords(books: OfflineBook[]): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(books));
  } catch {
    // Quota or private mode. The bytes may already be cached; losing the record
    // makes the book unreachable but breaks nothing else.
  }
}

/** Every record on this device, newest first. */
export function getOfflineBooks(): OfflineBook[] {
  return readRecords().sort((a, b) => b.savedAt - a.savedAt);
}

export function getOfflineBook(id: string): OfflineBook | null {
  return readRecords().find((b) => b.id === id) ?? null;
}

export function isOfflineBookSaved(id: string): boolean {
  return readRecords().some((b) => b.id === id);
}

/* ── Ownership ───────────────────────────────────────────────────────────── */

/** The account that last used the offline library here. Readable with no
 *  network, which is the whole point — `/api/me` cannot answer offline. */
export function getDeviceOwnerKey(): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return window.localStorage.getItem(OFFLINE_OWNER_KEY);
  } catch {
    return null;
  }
}

function setDeviceOwnerKey(ownerKey: string | null): void {
  if (!hasLocalStorage()) return;
  try {
    if (ownerKey) window.localStorage.setItem(OFFLINE_OWNER_KEY, ownerKey);
    else window.localStorage.removeItem(OFFLINE_OWNER_KEY);
  } catch {
    /* storage blocked */
  }
}

/** Records a given reader may see. A pre-v2 record has no owner and stays
 *  visible — it was saved before ownership existed, and hiding it would look
 *  like data loss. It is claimed by the first account to reconcile. */
export function isVisibleTo(book: OfflineBook, ownerKey: string | null): boolean {
  if (book.ownerKey === null) return true;
  return book.ownerKey === ownerKey;
}

export function getOfflineBooksFor(ownerKey: string | null): OfflineBook[] {
  return getOfflineBooks().filter((b) => isVisibleTo(b, ownerKey));
}

/**
 * Settle the device's offline library against the account now signed in.
 *
 * Called with a real id (never offline — it comes from `/api/me`): claims
 * unowned legacy records, then DESTROYS every record belonging to a different
 * account, bytes included. That is the shared-device guarantee: reader B can
 * never open, or silently re-download from cache, what reader A saved.
 *
 * Returns how many downloads were purged.
 */
export async function reconcileOfflineOwnership(
  ownerKey: string | null,
): Promise<number> {
  if (!ownerKey) return 0; // signed out: keep everything, show nothing new
  const books = readRecords();
  if (books.length === 0) {
    setDeviceOwnerKey(ownerKey);
    return 0;
  }

  const foreign = books.filter((b) => b.ownerKey !== null && b.ownerKey !== ownerKey);
  const kept = books
    .filter((b) => b.ownerKey === null || b.ownerKey === ownerKey)
    .map((b) =>
      b.ownerKey === null
        ? { ...b, ownerKey, version: OFFLINE_SCHEMA_VERSION }
        : b,
    );

  if (foreign.length > 0 || kept.some((b, i) => b !== books[i])) writeRecords(kept);
  for (const book of foreign) await clearOfflineBookFile(book);
  setDeviceOwnerKey(ownerKey);
  return foreign.length;
}

/* ── Cache Storage access ────────────────────────────────────────────────── */

async function openCache(name: string): Promise<Cache | null> {
  if (!isOfflineStorageSupported()) return null;
  try {
    return await caches.open(name);
  } catch {
    return null; // storage disabled — behaves exactly like "nothing saved"
  }
}

/**
 * The stored response for a book, or null.
 *
 * Looks under the `?offline=1` URL first (where downloads are written), then
 * the bare URL, then any cache at all — the last hop rescues entries written by
 * earlier versions of this code, which stored covers and files under other
 * names. `ignoreSearch` everywhere, for the reason in `offlineCacheUrl`.
 */
export async function getOfflineBookResponse(
  book: Pick<OfflineBook, "pdfUrl" | "cachedPdfUrl">,
): Promise<Response | null> {
  const cache = await openCache(CACHES.offlineBooks);
  if (!cache) return null;
  try {
    const hit =
      (await cache.match(book.cachedPdfUrl, { ignoreSearch: true })) ??
      (await cache.match(book.pdfUrl, { ignoreSearch: true })) ??
      (await caches.match(book.pdfUrl, { ignoreSearch: true }));
    return hit ?? null;
  } catch {
    return null;
  }
}

/**
 * Is the book actually readable right now?
 *
 * Deliberately not "is there a localStorage record" — the record can survive an
 * eviction of the bytes, and `/offline-books` has to be able to tell the user
 * their copy is gone instead of opening a reader that fails.
 */
export async function isOfflineBookAvailable(
  book: Pick<OfflineBook, "pdfUrl" | "cachedPdfUrl">,
): Promise<boolean> {
  const res = await getOfflineBookResponse(book);
  if (!res) return false;
  if (res.status !== 200 && res.status !== 206) return false;
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > 0) return true;
  try {
    return (await res.clone().blob()).size > 0;
  } catch {
    return false;
  }
}

/** The bytes, for handing to pdf.js through an object URL. */
export async function getOfflineBookBlob(
  book: Pick<OfflineBook, "pdfUrl" | "cachedPdfUrl">,
): Promise<Blob | null> {
  const res = await getOfflineBookResponse(book);
  if (!res) return null;
  try {
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/** Delete a book's bytes (PDF + cover) wherever they were written. */
export async function clearOfflineBookFile(
  book: Pick<OfflineBook, "pdfUrl" | "cachedPdfUrl" | "coverUrl">,
): Promise<void> {
  const cache = await openCache(CACHES.offlineBooks);
  if (!cache) return;
  try {
    await cache.delete(book.cachedPdfUrl, { ignoreSearch: true });
    await cache.delete(book.pdfUrl, { ignoreSearch: true });
    if (book.coverUrl) {
      // Covers were written to the book cache by pre-v2 code and to the cover
      // cache by this one. Remove both, or "Remove" leaves an orphan behind.
      await cache.delete(book.coverUrl, { ignoreSearch: true });
      const covers = await openCache(CACHES.bookCovers);
      await covers?.delete(book.coverUrl, { ignoreSearch: true });
    }
  } catch {
    /* nothing to remove */
  }
}

/** Remove a book completely: bytes first, then the record. In that order, so a
 *  failure halfway leaves a record the user can retry — never bytes nothing
 *  references. */
export async function removeOfflineBook(id: string): Promise<void> {
  const book = getOfflineBook(id);
  if (book) await clearOfflineBookFile(book);
  writeRecords(readRecords().filter((b) => b.id !== id));
}

/** Back-compat alias — the old name, now with byte cleanup that actually
 *  awaits. */
export const removeOfflineBookMeta = removeOfflineBook;

/* ── Storage accounting ──────────────────────────────────────────────────── */

export type OfflineStorageEstimate = {
  supported: boolean;
  /** Total bytes this ORIGIN uses, per the browser. Approximate by spec. */
  usageBytes: number | null;
  quotaBytes: number | null;
  /** Exact sum of the verified sizes of saved books. Ours, not the browser's. */
  booksBytes: number;
};

export async function getOfflineStorageEstimate(): Promise<OfflineStorageEstimate> {
  const booksBytes = readRecords().reduce((sum, b) => sum + (b.sizeBytes ?? 0), 0);
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { supported: false, usageBytes: null, quotaBytes: null, booksBytes };
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return {
      supported: true,
      usageBytes: typeof usage === "number" ? usage : null,
      quotaBytes: typeof quota === "number" ? quota : null,
      booksBytes,
    };
  } catch {
    return { supported: false, usageBytes: null, quotaBytes: null, booksBytes };
  }
}

/* ── The save pipeline ───────────────────────────────────────────────────── */

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.code === 22)
  );
}

/** Read the body with real byte accounting. Returns null when the browser gives
 *  us no stream, so the caller can fall back to an opaque `.blob()` read rather
 *  than invent a percentage. */
async function readWithProgress(
  res: Response,
  totalBytes: number | null,
  onProgress: (received: number) => void,
  signal?: AbortSignal,
): Promise<Blob | null> {
  if (!res.body?.getReader) return null;
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new OfflineSaveError("aborted");
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value as unknown as BlobPart);
        received += value.byteLength;
        if (received > MAX_OFFLINE_BOOK_BYTES) throw new OfflineSaveError("too-large");
        onProgress(received);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  void totalBytes;
  return new Blob(chunks, { type: res.headers.get("content-type") ?? "application/pdf" });
}

/**
 * Download a book and prove it is readable offline before recording it.
 *
 * Order is the contract: fetch → verify the response → write bytes → READ THE
 * BYTES BACK → write the record. Anything that fails rolls the cache entry back
 * so a retry starts clean and `/offline-books` never lists a book whose file
 * is not there.
 */
export async function downloadOfflineBook(
  input: OfflineBookInput,
  opts: {
    onProgress?: (p: OfflineSaveProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<OfflineBook> {
  const { onProgress, signal } = opts;
  const cacheUrl = offlineCacheUrl(input.pdfUrl);
  let totalBytes: number | null = null;
  const emit = (status: OfflineSaveStatus, receivedBytes = 0) =>
    onProgress?.({ status, receivedBytes, totalBytes });

  emit("preparing");
  if (!isOfflineStorageSupported()) throw new OfflineSaveError("unsupported");

  const existing = readRecords();
  if (
    existing.length >= MAX_OFFLINE_BOOKS &&
    !existing.some((b) => b.id === input.id)
  ) {
    throw new OfflineSaveError("limit");
  }

  const cache = await openCache(CACHES.offlineBooks);
  if (!cache) throw new OfflineSaveError("storage");

  let response: Response;
  try {
    response = await fetch(cacheUrl, { credentials: "same-origin", signal });
  } catch (err) {
    if (signal?.aborted) throw new OfflineSaveError("aborted");
    throw new OfflineSaveError("network", (err as Error)?.message);
  }

  if (!response.ok) throw new OfflineSaveError("server", `HTTP ${response.status}`);

  // An HTML body here means a login page or an error page, not a book. Storing
  // it would produce a "saved" book that renders as a broken document.
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/html")) throw new OfflineSaveError("server", "not a file");

  const declared = Number(response.headers.get("content-length") ?? "");
  totalBytes = Number.isFinite(declared) && declared > 0 ? declared : null;
  if (totalBytes !== null && totalBytes > MAX_OFFLINE_BOOK_BYTES) {
    throw new OfflineSaveError("too-large");
  }

  emit("downloading");
  let blob: Blob | null;
  try {
    blob =
      (await readWithProgress(
        response,
        totalBytes,
        (received) => emit("downloading", received),
        signal,
      )) ?? (await response.blob());
  } catch (err) {
    if (err instanceof OfflineSaveError) throw err;
    if (signal?.aborted) throw new OfflineSaveError("aborted");
    throw new OfflineSaveError("network", (err as Error)?.message);
  }

  if (!blob || blob.size === 0) throw new OfflineSaveError("empty");

  emit("saving", blob.size);
  const headers = new Headers({
    "Content-Type": contentType || "application/pdf",
    "Content-Length": String(blob.size),
    // pdf.js issues Range requests; the service worker's RangeRequestsPlugin
    // slices this stored full response to answer them.
    "Accept-Ranges": "bytes",
    "X-PTEC-Offline": "1",
  });
  try {
    await cache.put(cacheUrl, new Response(blob, { status: 200, headers }));
  } catch (err) {
    await cache.delete(cacheUrl, { ignoreSearch: true }).catch(() => {});
    throw new OfflineSaveError(isQuotaError(err) ? "quota" : "storage", (err as Error)?.message);
  }

  // ── The verification the old code skipped. ──────────────────────────────
  emit("verifying", blob.size);
  const stored = await cache.match(cacheUrl, { ignoreSearch: true });
  if (!stored) {
    throw new OfflineSaveError("verify", "PDF was not persisted to offline storage");
  }
  let storedSize = Number(stored.headers.get("content-length") ?? "");
  if (!Number.isFinite(storedSize) || storedSize <= 0) {
    try {
      storedSize = (await stored.clone().blob()).size;
    } catch {
      storedSize = 0;
    }
  }
  if (storedSize <= 0) {
    await cache.delete(cacheUrl, { ignoreSearch: true }).catch(() => {});
    throw new OfflineSaveError("verify", "offline copy is empty");
  }

  // Cover: nice to have, never the reason a save fails. Cross-origin CDN, so
  // no-cors — the opaque response renders in an <img> perfectly well.
  if (input.coverUrl) {
    try {
      const covers = await openCache(CACHES.bookCovers);
      if (covers) {
        const coverRes = await fetch(input.coverUrl, { mode: "no-cors" });
        await covers.put(input.coverUrl, coverRes);
      }
    } catch {
      /* the book is still fully readable without its cover */
    }
  }

  const record: OfflineBook = {
    id: input.id,
    slug: input.slug,
    title: input.title,
    author: input.author,
    coverUrl: input.coverUrl,
    coverColor: input.coverColor,
    pdfUrl: input.pdfUrl,
    cachedPdfUrl: cacheUrl,
    sizeBytes: storedSize,
    savedAt: Date.now(),
    ownerKey: input.ownerKey,
    version: OFFLINE_SCHEMA_VERSION,
  };
  writeRecords([record, ...existing.filter((b) => b.id !== record.id)]);
  if (input.ownerKey) setDeviceOwnerKey(input.ownerKey);

  emit("saved", storedSize);
  return record;
}

/** Human-readable size. Binary units, one decimal below 100. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
