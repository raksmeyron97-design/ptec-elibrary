/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  READER_KEYS,
  loadBookmarkRecord,
  loadBookmarks,
  saveBookmarkRecord,
} from "./reader-config";

/**
 * The device's bookmark record and who it belongs to.
 *
 * PTEC students read on shared lab machines, and localStorage is per-ORIGIN,
 * not per-account. Without an ownership stamp the first reader to sign in
 * after somebody else would upload that person's bookmarks into their own
 * account on the next sync — silently, and unrecoverably, since nothing
 * afterwards records which pages were whose.
 *
 * The stamp is only half the guarantee; the other half is that the SERVER
 * makes the decision (`syncReaderBookmarks`), because the browser cannot know
 * which account it is talking to. These tests cover the storage half: the
 * record round-trips, a pre-0141 bare array is still read, and neither shape
 * can be corrupted into a bookmark list that lies.
 */
const BOOK = "33333333-3333-4333-8333-333333333301";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  window.localStorage.clear();
});

describe("bookmark record ownership", () => {
  it("round-trips pages and the account they belong to", () => {
    saveBookmarkRecord(BOOK, { owner: ALICE, pages: [3, 1, 42] });
    expect(loadBookmarkRecord(BOOK)).toEqual({ owner: ALICE, pages: [1, 3, 42] });
  });

  it("reads a pre-0141 bare array as unowned, so an existing reader's bookmarks survive", () => {
    // This is the migration case. Returning [] here would silently discard
    // every bookmark made before 0141 shipped.
    window.localStorage.setItem(READER_KEYS.bookmarks(BOOK), JSON.stringify([7, 7, 2]));
    expect(loadBookmarkRecord(BOOK)).toEqual({ owner: null, pages: [2, 7] });
  });

  it("keeps loadBookmarks() working for the offline reader across both shapes", () => {
    window.localStorage.setItem(READER_KEYS.bookmarks(BOOK), JSON.stringify([5, 9]));
    expect(loadBookmarks(BOOK)).toEqual([5, 9]);
    saveBookmarkRecord(BOOK, { owner: ALICE, pages: [5, 9] });
    expect(loadBookmarks(BOOK)).toEqual([5, 9]);
  });

  it("treats a corrupt or absent record as empty and unowned, never as a throw", () => {
    // The reader must open. A bookmark panel is not worth a blank screen.
    for (const raw of ["{ not json", "null", '"a string"', "17"]) {
      window.localStorage.setItem(READER_KEYS.bookmarks(BOOK), raw);
      expect(loadBookmarkRecord(BOOK)).toEqual({ owner: null, pages: [] });
    }
    window.localStorage.clear();
    expect(loadBookmarkRecord(BOOK)).toEqual({ owner: null, pages: [] });
  });

  it("drops junk page values rather than rendering them", () => {
    window.localStorage.setItem(
      READER_KEYS.bookmarks(BOOK),
      JSON.stringify({ o: ALICE, p: [1, 0, -4, "12", null, 2.5, 8] }),
    );
    // 2.5 is kept as-is: a fractional page cannot be produced by the reader,
    // and rounding one would invent a position rather than reject a value.
    // What must not survive is anything that is not a usable page number.
    const { pages } = loadBookmarkRecord(BOOK);
    expect(pages.every((p) => typeof p === "number" && p >= 1)).toBe(true);
    expect(pages).toContain(1);
    expect(pages).toContain(8);
    expect(pages).not.toContain(0);
    expect(pages).not.toContain(-4);
  });

  it("ignores a non-string owner rather than storing it", () => {
    window.localStorage.setItem(
      READER_KEYS.bookmarks(BOOK),
      JSON.stringify({ o: { id: ALICE }, p: [1] }),
    );
    expect(loadBookmarkRecord(BOOK).owner).toBeNull();
  });
});
