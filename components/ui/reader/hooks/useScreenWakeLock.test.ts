import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenWakeLock, WAKE_IDLE_MS } from "./useScreenWakeLock";

class FakeSentinel extends EventTarget {
  released = false;
  async release() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  }
}

let held: FakeSentinel[] = [];
const request = vi.fn(async () => {
  const s = new FakeSentinel();
  held.push(s);
  return s;
});
const live = () => held.filter((s) => !s.released).length;
const flush = () => act(async () => {});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  held = [];
  request.mockClear();
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
  setVisibility("visible");
});
afterEach(() => {
  vi.useRealTimers();
  // @ts-expect-error — test cleanup of the stub
  delete navigator.wakeLock;
});

function mount(active = true) {
  const root = document.createElement("div");
  document.body.append(root);
  const rootRef = { current: root };
  const hook = renderHook(({ on }) => useScreenWakeLock({ active: on, rootRef }), { initialProps: { on: active } });
  return { root, hook };
}

describe("useScreenWakeLock", () => {
  it("holds the screen on while reading, lets it sleep after a long pause, and takes it back on a touch", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { root } = mount();
    await flush();
    expect(live()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(WAKE_IDLE_MS + 1000);
    });
    expect(live()).toBe(0);

    await act(async () => {
      root.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(live()).toBe(1);
  });

  it("a scroll inside the reader (which does not bubble) or a key also takes it back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { root } = mount();
    const viewport = document.createElement("div");
    root.append(viewport);
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(WAKE_IDLE_MS + 1000);
    });
    expect(live()).toBe(0);
    await act(async () => {
      viewport.dispatchEvent(new Event("scroll", { bubbles: false }));
    });
    expect(live()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(WAKE_IDLE_MS + 1000);
    });
    expect(live()).toBe(0);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
    });
    expect(live()).toBe(1);
  });

  it("steady reading keeps ONE lock, rather than asking again on every touch", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { root } = mount();
    await flush();
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        vi.advanceTimersByTime(WAKE_IDLE_MS / 2);
        root.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
    }
    expect(request).toHaveBeenCalledTimes(1);
    expect(live()).toBe(1);
  });

  it("re-takes the lock when the page comes back (the OS drops it on hide)", async () => {
    mount();
    await flush();
    await act(async () => {
      await held[0].release(); // what the OS does on an app switch
      setVisibility("hidden");
    });
    expect(live()).toBe(0);
    await act(async () => setVisibility("visible"));
    expect(live()).toBe(1);
  });

  it("asks for nothing when inactive (the preview on a book page), and lets go on unmount", async () => {
    const { hook } = mount(false);
    await flush();
    expect(request).not.toHaveBeenCalled();
    hook.rerender({ on: true });
    await flush();
    expect(live()).toBe(1);
    hook.unmount();
    await flush();
    expect(live()).toBe(0);
  });

  it("does nothing where the API does not exist", async () => {
    // @ts-expect-error — simulate an old browser
    delete navigator.wakeLock;
    expect(() => mount()).not.toThrow();
    await flush();
    expect(request).not.toHaveBeenCalled();
  });
});
