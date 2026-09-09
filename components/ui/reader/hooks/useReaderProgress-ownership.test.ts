import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { READER_KEYS } from "../reader-config";
import { LOCAL_POSITION_DEBOUNCE_MS, useReaderProgress } from "./useReaderProgress";

/*
 * THE WRITE HALF of shared-device isolation for the reading position.
 *
 * `lib/reader/shared-device-resume.test.ts` covers the read half: a device
 * record stamped for another account is not resumed from. That check can only
 * fire if something actually writes the stamp, and this is the only place that
 * writes `ebook:pos:<bookId>` — so the two tests are load-bearing together and
 * neither is sufficient alone.
 *
 * The `s` field matters as much as `o` here. It names the percentage this
 * device last had ACKNOWLEDGED by the server, and `resolveResumePage` reads it
 * as the clock-free "nothing was read elsewhere" signal. Inherited across a
 * change of account it would assert that this device is level with a server
 * row it has never written — so taking over another reader's record has to
 * start it clean rather than carry it forward.
 */

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOOK = "33333333-3333-4333-8333-333333333301";

vi.mock("@/app/actions/reading-progress", () => ({
  saveReadingProgress: vi.fn(async () => {}),
}));

const stored = () => JSON.parse(window.localStorage.getItem(READER_KEYS.position(BOOK))!);

/** Mount the reader's progress hook as a given account, on a document whose
    real page count is known (`ready`), and let the debounced local write run. */
function readAs(accountId: string | null, page: number) {
  const { unmount } = renderHook(() =>
    useReaderProgress({
      bookId: BOOK,
      isLoggedIn: accountId !== null,
      accountId,
      ready: true,
      numPages: 500,
      currentPage: page,
      initialProgressPct: 0,
      initialMaxProgressPct: 0,
    }),
  );
  act(() => {
    vi.advanceTimersByTime(LOCAL_POSITION_DEBOUNCE_MS + 10);
  });
  unmount();
}

describe("useReaderProgress device-record ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps the saved position with the account that is reading", () => {
    readAs(BOB, 12);
    expect(stored().o).toBe(BOB);
    expect(stored().p).toBe(12);
  });

  it("takes over another reader's record rather than inheriting it", () => {
    // Alice read to page 237 on this shared machine and signed out; her record
    // survives, because sign-out clears cookies and not localStorage.
    window.localStorage.setItem(
      READER_KEYS.position(BOOK),
      JSON.stringify({ p: 237, pct: 47, t: Date.now(), s: 47, o: ALICE }),
    );

    readAs(BOB, 3);

    const after = stored();
    expect(after.o).toBe(BOB);
    expect(after.p).toBe(3);
    // Alice's acknowledged percentage must not become Bob's.
    expect(after.s).toBeUndefined();
  });

  it("claims an unstamped record, which is what carries an existing reader forward", () => {
    window.localStorage.setItem(
      READER_KEYS.position(BOOK),
      JSON.stringify({ p: 100, pct: 20, t: Date.now(), s: 20 }),
    );

    readAs(BOB, 101);

    const after = stored();
    expect(after.o).toBe(BOB);
    // Its own sync marker is kept: the record was already this device's.
    expect(after.s).toBe(20);
  });

  it("leaves the stamp alone when there is no account — the offline reader", () => {
    window.localStorage.setItem(
      READER_KEYS.position(BOOK),
      JSON.stringify({ p: 237, pct: 47, o: ALICE }),
    );

    // The offline reader passes no account (and never reaches the server), so
    // it must keep writing Alice's record as Alice's rather than orphaning it.
    readAs(null, 240);

    expect(stored().o).toBe(ALICE);
    expect(stored().p).toBe(240);
  });
});
