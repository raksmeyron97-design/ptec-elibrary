import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import useAutoSave from "./useAutoSave";
import { describeSaveError, SESSION_EXPIRED_MESSAGE } from "./save-error";

/*
  The defect these tests pin, in the reporter's words: the form showed the red
  "An unexpected response was received from the server." banner and the blue
  "Draft saved automatically" toast at the same time. `save()` caught every
  failure into component state and resolved anyway, so the hook could not tell a
  saved record from an unsaved one — and reported the one the author was least
  able to act on.
*/

const INTERVAL = 30_000;

/** Drives the hook with a controllable save function. */
function Harness(props: {
  saveFn: () => Promise<void>;
  onSaved: () => void;
  onError: (message: string) => void;
  onPaused?: () => void;
  isDirty?: boolean;
}) {
  const { paused } = useAutoSave({
    isDirty: props.isDirty ?? true,
    isEdit: true,
    busy: false,
    saveFn: props.saveFn,
    intervalMs: INTERVAL,
    onSaved: props.onSaved,
    onError: props.onError,
    onPaused: props.onPaused,
  });
  return <span data-testid="paused">{String(paused)}</span>;
}

/** Runs the pending timers and lets the save promise settle. */
async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useAutoSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports a save that landed", async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    render(
      <Harness saveFn={async () => {}} onSaved={onSaved} onError={onError} />,
    );

    await tick(INTERVAL);

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("never reports a rejected save as saved", async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    render(
      <Harness
        saveFn={async () => {
          throw new Error("An unexpected response was received from the server.");
        }}
        onSaved={onSaved}
        onError={onError}
      />,
    );

    await tick(INTERVAL);

    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "An unexpected response was received from the server.",
    );
  });

  it("a throw from onSaved is not re-reported as a save failure", async () => {
    const onError = vi.fn();
    const onSaved = vi.fn(() => {
      throw new Error("toast exploded");
    });
    render(
      <Harness saveFn={async () => {}} onSaved={onSaved} onError={onError} />,
    );

    await tick(INTERVAL);

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backs off, then stops asking and says so once", async () => {
    const saveFn = vi.fn(async () => {
      throw new Error("nope");
    });
    const onPaused = vi.fn();
    const { getByTestId } = render(
      <Harness
        saveFn={saveFn}
        onSaved={vi.fn()}
        onError={vi.fn()}
        onPaused={onPaused}
      />,
    );

    // 1st attempt at 30s, 2nd at +60s, 3rd at +120s — then paused.
    await tick(INTERVAL);
    expect(saveFn).toHaveBeenCalledTimes(1);

    await tick(INTERVAL);
    expect(saveFn).toHaveBeenCalledTimes(1); // backed off: not due yet
    await tick(INTERVAL);
    expect(saveFn).toHaveBeenCalledTimes(2);

    await tick(INTERVAL * 4);
    expect(saveFn).toHaveBeenCalledTimes(3);
    expect(getByTestId("paused").textContent).toBe("true");
    expect(onPaused).toHaveBeenCalledTimes(1);

    // Nothing further is attempted, and the stop is announced only once.
    await tick(INTERVAL * 20);
    expect(saveFn).toHaveBeenCalledTimes(3);
    expect(onPaused).toHaveBeenCalledTimes(1);
  });

  it("a save that lands clears the failures behind it", async () => {
    let fail = true;
    const saveFn = vi.fn(async () => {
      if (fail) throw new Error("nope");
    });
    const { getByTestId, rerender } = render(
      <Harness saveFn={saveFn} onSaved={vi.fn()} onError={vi.fn()} />,
    );

    await tick(INTERVAL);
    expect(saveFn).toHaveBeenCalledTimes(1);

    // The author saves manually and it works: the form goes clean.
    fail = false;
    rerender(
      <Harness
        saveFn={saveFn}
        onSaved={vi.fn()}
        onError={vi.fn()}
        isDirty={false}
      />,
    );
    // …then edits again. The next attempt is due at the base interval, not the
    // doubled one, and the hook is nowhere near giving up.
    rerender(<Harness saveFn={saveFn} onSaved={vi.fn()} onError={vi.fn()} />);

    await tick(INTERVAL);
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(getByTestId("paused").textContent).toBe("false");
  });
});

describe("describeSaveError", () => {
  it("translates Next's E394 into something an author can act on", () => {
    const result = describeSaveError(
      new Error("An unexpected response was received from the server."),
    );
    expect(result.sessionExpired).toBe(true);
    expect(result.message).toBe(SESSION_EXPIRED_MESSAGE);
    expect(result.message).not.toContain("unexpected response");
  });

  it("passes a real server message through untouched", () => {
    const result = describeSaveError(new Error("A member with that slug exists."));
    expect(result).toEqual({
      message: "A member with that slug exists.",
      sessionExpired: false,
    });
  });

  it("falls back for a non-Error throw and an empty message", () => {
    expect(describeSaveError("boom")).toEqual({
      message: "Save failed.",
      sessionExpired: false,
    });
    expect(describeSaveError(new Error(""))).toEqual({
      message: "Save failed.",
      sessionExpired: false,
    });
  });
});
