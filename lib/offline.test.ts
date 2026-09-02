import { beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  MAX_OFFLINE_BOOKS,
  OFFLINE_SCHEMA_VERSION,
  OfflineSaveError,
  clearOfflineBookFile,
  downloadOfflineBook,
  formatBytes,
  getDeviceOwnerKey,
  getOfflineBook,
  getOfflineBookBlob,
  getOfflineBooks,
  getOfflineBooksFor,
  isOfflineBookAvailable,
  isOfflineBookSaved,
  isVisibleTo,
  offlineCacheUrl,
  reconcileOfflineOwnership,
  removeOfflineBook,
  type OfflineBook,
} from "@/lib/offline";
import { CACHES } from "@/lib/sw-policy";

// jsdom's Blob and undici's Response come from different realms: passing the
// former to the latter stringifies it to "[object Blob]" (13 bytes), which no
// browser does. Node's own Blob is the one undici understands, so the bytes
// this suite asserts on are the bytes the code actually moves.
vi.stubGlobal("Blob", NodeBlob);

// ─────────────────────────────────────────────────────────────────────────────
// A Cache Storage double with the ONE behaviour the whole design rests on:
// `ignoreSearch`. Downloads are stored as `…/file?offline=1` and read back as
// `…/file`, so a fake that matched exact URLs would pass tests that the browser
// would fail. Everything below is asserted against this semantics.
// ─────────────────────────────────────────────────────────────────────────────
class FakeCache {
  entries = new Map<string, Response>();

  private keysFor(url: string, ignoreSearch?: boolean): string[] {
    if (!ignoreSearch) return this.entries.has(url) ? [url] : [];
    const bare = url.split("?")[0];
    return [...this.entries.keys()].filter((k) => k.split("?")[0] === bare);
  }

  async match(url: string, opts?: { ignoreSearch?: boolean }) {
    const [hit] = this.keysFor(url, opts?.ignoreSearch);
    return hit ? this.entries.get(hit) : undefined;
  }

  async put(url: string, res: Response) {
    this.entries.set(url, res);
  }

  async delete(url: string, opts?: { ignoreSearch?: boolean }) {
    const keys = this.keysFor(url, opts?.ignoreSearch);
    keys.forEach((k) => this.entries.delete(k));
    return keys.length > 0;
  }
}

const caches_ = new Map<string, FakeCache>();

function installFakeCaches() {
  caches_.clear();
  const api = {
    open: vi.fn(async (name: string) => {
      if (!caches_.has(name)) caches_.set(name, new FakeCache());
      return caches_.get(name) as unknown as Cache;
    }),
    match: vi.fn(async (url: string, opts?: { ignoreSearch?: boolean }) => {
      for (const cache of caches_.values()) {
        const hit = await cache.match(url, opts);
        if (hit) return hit;
      }
      return undefined;
    }),
    keys: vi.fn(async () => [...caches_.keys()]),
    delete: vi.fn(async (name: string) => caches_.delete(name)),
  };
  vi.stubGlobal("caches", api);
  return api;
}

const bookCache = () => caches_.get(CACHES.offlineBooks) as FakeCache;

const PDF_URL = "/api/books/book-1/file";
const input = (over: Partial<Parameters<typeof downloadOfflineBook>[0]> = {}) => ({
  id: "book-1",
  slug: "a-book",
  title: "A Book",
  author: "An Author",
  coverUrl: null,
  pdfUrl: PDF_URL,
  ownerKey: "user-a",
  ...over,
});

function pdfResponse(bytes = 2048, headers: Record<string, string> = {}) {
  const body = new Uint8Array(bytes).fill(37); // '%'
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes),
      ...headers,
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.stubGlobal("Blob", NodeBlob);
  installFakeCaches();
});

describe("offlineCacheUrl — the explicit-download marker", () => {
  it("adds ?offline=1 so an ordinary reader fetch is a different request", () => {
    expect(offlineCacheUrl(PDF_URL)).toBe("/api/books/book-1/file?offline=1");
  });

  it("merges into an existing query rather than replacing it", () => {
    expect(offlineCacheUrl("/api/books/b/file?x=1")).toBe("/api/books/b/file?x=1&offline=1");
  });

  it("is idempotent", () => {
    const once = offlineCacheUrl(PDF_URL);
    expect(offlineCacheUrl(once)).toBe(once);
  });
});

describe("downloadOfflineBook — the save contract", () => {
  it("stores the bytes under ?offline=1 and records the book only after verifying them", async () => {
    const fetchMock = vi.fn(async () => pdfResponse(4096));
    vi.stubGlobal("fetch", fetchMock);

    const statuses: string[] = [];
    const record = await downloadOfflineBook(input(), {
      onProgress: (p) => statuses.push(p.status),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/book-1/file?offline=1",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(statuses).toEqual(
      expect.arrayContaining(["preparing", "downloading", "saving", "verifying", "saved"]),
    );
    // The bytes are under the ?offline=1 key…
    expect(bookCache().entries.has("/api/books/book-1/file?offline=1")).toBe(true);
    // …and the record points at both shapes.
    expect(record).toMatchObject({
      id: "book-1",
      pdfUrl: PDF_URL,
      cachedPdfUrl: "/api/books/book-1/file?offline=1",
      sizeBytes: 4096,
      ownerKey: "user-a",
      version: OFFLINE_SCHEMA_VERSION,
    });
    expect(isOfflineBookSaved("book-1")).toBe(true);
    expect(getDeviceOwnerKey()).toBe("user-a");
  });

  it("reports real byte progress and never invents a total the server did not send", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(new Uint8Array(1000), { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    const seen: Array<{ received: number; total: number | null }> = [];
    await downloadOfflineBook(input(), {
      onProgress: (p) => seen.push({ received: p.receivedBytes, total: p.totalBytes }),
    });
    expect(seen.every((s) => s.total === null)).toBe(true);
    expect(seen.at(-1)?.received).toBe(1000);
  });

  it("writes NO record when the download fails, and leaves nothing in the cache", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
    await expect(downloadOfflineBook(input())).rejects.toMatchObject({ code: "server" });
    expect(getOfflineBooks()).toEqual([]);
    expect(bookCache()?.entries.size ?? 0).toBe(0);
  });

  it("refuses an HTML body — a login or error page is not a book", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response("<!doctype html><html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    await expect(downloadOfflineBook(input())).rejects.toMatchObject({ code: "server" });
    expect(getOfflineBooks()).toEqual([]);
  });

  it("refuses an empty file", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(new Uint8Array(0), { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    await expect(downloadOfflineBook(input())).rejects.toMatchObject({ code: "empty" });
    expect(getOfflineBooks()).toEqual([]);
  });

  it("rolls the cache entry back and reports 'quota' when the write is refused", async () => {
    vi.stubGlobal("fetch", async () => pdfResponse());
    const cache = await caches.open(CACHES.offlineBooks);
    const quota = new DOMException("quota", "QuotaExceededError");
    vi.spyOn(cache, "put").mockRejectedValueOnce(quota);

    await expect(downloadOfflineBook(input())).rejects.toMatchObject({ code: "quota" });
    expect(getOfflineBooks()).toEqual([]);
    expect(bookCache().entries.size).toBe(0);
  });

  it("fails with 'verify' — and records nothing — when the entry is not readable back", async () => {
    vi.stubGlobal("fetch", async () => pdfResponse());
    const cache = await caches.open(CACHES.offlineBooks);
    // Simulate the eviction-between-write-and-read that `cache.add()` could
    // never notice. This is the exact case the old button called "Saved".
    vi.spyOn(cache, "match").mockResolvedValue(undefined);

    await expect(downloadOfflineBook(input())).rejects.toBeInstanceOf(OfflineSaveError);
    expect(getOfflineBooks()).toEqual([]);
  });

  it("stops at the device limit instead of silently deleting an older download", async () => {
    vi.stubGlobal("fetch", async () => pdfResponse());
    const filler: OfflineBook[] = Array.from({ length: MAX_OFFLINE_BOOKS }, (_, i) => ({
      id: `filler-${i}`, slug: `f${i}`, title: "F", author: "", coverUrl: null,
      pdfUrl: `/api/books/f${i}/file`, cachedPdfUrl: `/api/books/f${i}/file?offline=1`,
      sizeBytes: 1, savedAt: i, ownerKey: "user-a", version: OFFLINE_SCHEMA_VERSION,
    }));
    localStorage.setItem("ptec_offline_books", JSON.stringify(filler));

    await expect(downloadOfflineBook(input())).rejects.toMatchObject({ code: "limit" });
    expect(getOfflineBooks()).toHaveLength(MAX_OFFLINE_BOOKS);
  });

  it("re-saving the same book replaces its record rather than duplicating it", async () => {
    vi.stubGlobal("fetch", async () => pdfResponse());
    await downloadOfflineBook(input());
    await downloadOfflineBook(input({ title: "A Book (2nd ed.)" }));
    expect(getOfflineBooks()).toHaveLength(1);
    expect(getOfflineBook("book-1")?.title).toBe("A Book (2nd ed.)");
  });
});

describe("availability — the cache is the source of truth, not localStorage", () => {
  it("finds the ?offline=1 entry when asked for the bare reader URL", async () => {
    vi.stubGlobal("fetch", async () => pdfResponse());
    const book = await downloadOfflineBook(input());
    expect(await isOfflineBookAvailable({ pdfUrl: book.pdfUrl, cachedPdfUrl: book.pdfUrl })).toBe(true);
    expect((await getOfflineBookBlob(book))?.size).toBe(2048);
  });

  it("reports unavailable when the record survives but the bytes are gone", async () => {
    vi.stubGlobal("fetch", async () => pdfResponse());
    const book = await downloadOfflineBook(input());
    bookCache().entries.clear(); // browser eviction
    expect(isOfflineBookSaved("book-1")).toBe(true); // the record is still there…
    expect(await isOfflineBookAvailable(book)).toBe(false); // …and it is a lie
    expect(await getOfflineBookBlob(book)).toBeNull();
  });
});

describe("removal", () => {
  it("deletes the ?offline=1 entry even though the record stores the bare URL", async () => {
    vi.stubGlobal("fetch", async () => pdfResponse());
    await downloadOfflineBook(input());
    // A pre-v2 record: no cachedPdfUrl at all.
    localStorage.setItem(
      "ptec_offline_books",
      JSON.stringify([{ id: "book-1", slug: "a-book", title: "A Book", author: "", coverUrl: null, pdfUrl: PDF_URL, savedAt: 1 }]),
    );

    await removeOfflineBook("book-1");
    expect(bookCache().entries.size).toBe(0);
    expect(getOfflineBooks()).toEqual([]);
  });

  it("removes the cover from both the cover cache and the legacy book cache", async () => {
    const covers = (await caches.open(CACHES.bookCovers)) as unknown as FakeCache;
    const books = (await caches.open(CACHES.offlineBooks)) as unknown as FakeCache;
    covers.entries.set("https://cdn/x.jpg", new Response("img"));
    books.entries.set("https://cdn/x.jpg", new Response("img")); // where pre-v2 put it

    await clearOfflineBookFile({ pdfUrl: PDF_URL, cachedPdfUrl: offlineCacheUrl(PDF_URL), coverUrl: "https://cdn/x.jpg" });
    expect(covers.entries.size).toBe(0);
    expect(books.entries.size).toBe(0);
  });
});

describe("shared devices — ownership", () => {
  const rec = (id: string, ownerKey: string | null): OfflineBook => ({
    id, slug: id, title: id, author: "", coverUrl: null,
    pdfUrl: `/api/books/${id}/file`, cachedPdfUrl: `/api/books/${id}/file?offline=1`,
    sizeBytes: 10, savedAt: 1, ownerKey, version: OFFLINE_SCHEMA_VERSION,
  });

  it("hides another account's downloads from the library listing", () => {
    localStorage.setItem("ptec_offline_books", JSON.stringify([rec("a", "user-a"), rec("b", "user-b")]));
    expect(getOfflineBooksFor("user-b").map((b) => b.id)).toEqual(["b"]);
    expect(isVisibleTo(rec("a", "user-a"), "user-b")).toBe(false);
  });

  it("keeps pre-v2 records visible and claims them for the reader who reconciles", async () => {
    localStorage.setItem("ptec_offline_books", JSON.stringify([rec("legacy", null)]));
    expect(getOfflineBooksFor("user-a").map((b) => b.id)).toEqual(["legacy"]);
    await reconcileOfflineOwnership("user-a");
    expect(getOfflineBook("legacy")?.ownerKey).toBe("user-a");
  });

  it("destroys the previous account's downloads — bytes included — when a different account signs in", async () => {
    const cache = (await caches.open(CACHES.offlineBooks)) as unknown as FakeCache;
    cache.entries.set("/api/books/a/file?offline=1", new Response("pdf"));
    cache.entries.set("/api/books/b/file?offline=1", new Response("pdf"));
    localStorage.setItem("ptec_offline_books", JSON.stringify([rec("a", "user-a"), rec("b", "user-b")]));

    const purged = await reconcileOfflineOwnership("user-b");

    expect(purged).toBe(1);
    expect(getOfflineBooks().map((b) => b.id)).toEqual(["b"]);
    expect([...cache.entries.keys()]).toEqual(["/api/books/b/file?offline=1"]);
    expect(getDeviceOwnerKey()).toBe("user-b");
  });

  it("signing out alone destroys nothing", async () => {
    localStorage.setItem("ptec_offline_books", JSON.stringify([rec("a", "user-a")]));
    expect(await reconcileOfflineOwnership(null)).toBe(0);
    expect(getOfflineBooks()).toHaveLength(1);
  });
});

describe("corrupt or legacy metadata", () => {
  it("reads as an empty library rather than throwing", () => {
    localStorage.setItem("ptec_offline_books", "{not json");
    expect(getOfflineBooks()).toEqual([]);
  });

  it("drops entries with no id or no file URL", () => {
    localStorage.setItem("ptec_offline_books", JSON.stringify([{ id: "x" }, { pdfUrl: "/f" }, null]));
    expect(getOfflineBooks()).toEqual([]);
  });

  it("upgrades a v1 record in place, deriving the cache URL it was stored under", () => {
    localStorage.setItem(
      "ptec_offline_books",
      JSON.stringify([{ id: "b", slug: "s", title: "T", author: "A", coverUrl: null, pdfUrl: PDF_URL, savedAt: 5 }]),
    );
    expect(getOfflineBook("b")).toMatchObject({
      cachedPdfUrl: "/api/books/book-1/file?offline=1",
      ownerKey: null,
      version: 1,
      sizeBytes: null,
    });
  });
});

describe("formatBytes", () => {
  it.each([
    [null, "—"],
    [0, "—"],
    [900, "900 B"],
    [1536, "1.5 KB"],
    [5 * 1024 * 1024, "5 MB"],
  ])("formats %s as %s", (input_, expected) => {
    expect(formatBytes(input_ as number | null)).toBe(expected);
  });
});
