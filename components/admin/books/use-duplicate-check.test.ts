// The debounce, the supersession, and the one thing this hook must never do.
//
// A duplicate gate that goes quiet is indistinguishable from a duplicate gate
// that found nothing, so every path out of a failed check has to land in an
// explicit `error` state — including the one where the Server Action rejects
// instead of returning `{ ok: false }`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const checkBookDuplicates = vi.fn();
vi.mock("@/app/actions/book-duplicates", () => ({ checkBookDuplicates }));

const { useDuplicateCheck, hasEnoughSignal } = await import("./use-duplicate-check");

const OK = {
  ok: true as const,
  matches: [],
  top: null,
  blocked: false,
  truncated: false,
  isbn: { status: "empty" as const, canonical: null },
  skipped: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  checkBookDuplicates.mockResolvedValue(OK);
});

describe("hasEnoughSignal", () => {
  it("needs a usable title, a complete ISBN, or a file hash", () => {
    expect(hasEnoughSignal({ title: "abc" })).toBe(false);
    expect(hasEnoughSignal({ title: "abcd" })).toBe(true);
    expect(hasEnoughSignal({ isbn: "978-0-306-40615-7" })).toBe(true);
    expect(hasEnoughSignal({ isbn: "978-0" })).toBe(false);
    expect(hasEnoughSignal({ contentHash: "a".repeat(64) })).toBe(true);
    expect(hasEnoughSignal({})).toBe(false);
  });
});

describe("useDuplicateCheck", () => {
  it("stays idle — not clean — below the trigger threshold", async () => {
    const { result } = renderHook(() => useDuplicateCheck({ title: "ab" }, 1));
    await waitFor(() => expect(checkBookDuplicates).not.toHaveBeenCalled());
    expect(result.current.state).toBe("idle");
  });

  it("checks once the record is worth checking", async () => {
    const { result } = renderHook(() => useDuplicateCheck({ title: "Mathematics" }, 1));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(checkBookDuplicates).toHaveBeenCalledTimes(1);
  });

  it("reports a REJECTED check as an error, never as a clean result", async () => {
    checkBookDuplicates.mockRejectedValue(new Error("connection lost"));
    const { result } = renderHook(() => useDuplicateCheck({ title: "Mathematics" }, 1));
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toContain("connection lost");
    expect(result.current.result).toBeNull();
  });

  it("reports a refused check as an error too", async () => {
    checkBookDuplicates.mockResolvedValue({ ok: false, error: "Forbidden" });
    const { result } = renderHook(() => useDuplicateCheck({ title: "Mathematics" }, 1));
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toBe("Forbidden");
  });

  it("does not keep a verdict on screen for a record that has changed", async () => {
    const { result, rerender } = renderHook(
      ({ title }) => useDuplicateCheck({ title }, 5),
      { initialProps: { title: "Mathematics" } },
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
    rerender({ title: "Mathematics for Teachers" });
    // Reverting to "checking" rather than blanking to idle is what stops the
    // panel flickering on every keystroke.
    expect(result.current.state).toBe("checking");
    await waitFor(() => expect(result.current.state).toBe("ready"));
  });

  it("runNow returns null instead of querying when there is nothing to check", async () => {
    const { result } = renderHook(() => useDuplicateCheck({ title: "ab" }, 1));
    let returned: unknown = "unset";
    await act(async () => {
      returned = await result.current.runNow();
    });
    expect(returned).toBeNull();
    expect(checkBookDuplicates).not.toHaveBeenCalled();
  });

  it("runNow re-checks the record as it stands now, not as the debounce saw it", async () => {
    const { result } = renderHook(() => useDuplicateCheck({ title: "Mathematics" }, 100_000));
    await act(async () => {
      await result.current.runNow();
    });
    expect(checkBookDuplicates).toHaveBeenCalledWith(expect.objectContaining({ title: "Mathematics" }));
    expect(result.current.state).toBe("ready");
  });
});
