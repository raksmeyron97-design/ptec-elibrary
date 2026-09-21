import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFocusFullscreen } from "./useFocusFullscreen";

// jsdom has no Fullscreen API and no screen.orientation. These stubs model
// the parts the hook reads: whether fullscreen is available, which element
// holds it, the fullscreenchange event, and the orientation lock.
let fullscreenElement: Element | null = null;
let enabled = true;
let coarse = true;
const lock = vi.fn(async () => {});
const exitFullscreen = vi.fn(async () => {
  fullscreenElement = null;
  document.dispatchEvent(new Event("fullscreenchange"));
});

function enter(el: Element) {
  fullscreenElement = el;
  document.dispatchEvent(new Event("fullscreenchange"));
}
function leave() {
  fullscreenElement = null;
  document.dispatchEvent(new Event("fullscreenchange"));
}

beforeEach(() => {
  fullscreenElement = null;
  enabled = true;
  coarse = true;
  lock.mockClear();
  exitFullscreen.mockClear();
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => enabled });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
  Object.defineProperty(screen, "orientation", { configurable: true, value: { lock } });
  vi.mocked(window.matchMedia).mockImplementation(
    (q: string) => ({ matches: q === "(pointer: coarse)" ? coarse : false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  document.body.innerHTML = "";
});

function mount(active = true, request?: (el: HTMLElement) => Promise<void>) {
  const root = document.createElement("div");
  document.body.append(root);
  const requestFullscreen = vi.fn(request ?? (async () => enter(root)));
  root.requestFullscreen = requestFullscreen as unknown as HTMLElement["requestFullscreen"];
  const onExit = vi.fn();
  const hook = renderHook(({ on }) => useFocusFullscreen({ active: on, rootRef: { current: root }, onExit }), {
    initialProps: { on: active },
  });
  return { root, requestFullscreen, onExit, hook };
}
const flush = () => act(async () => {});

describe("useFocusFullscreen", () => {
  it("on a touch device, takes the whole screen with the navigation UI hidden, then unlocks rotation", async () => {
    const { requestFullscreen } = mount();
    await flush();
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(lock).toHaveBeenCalledWith("any");
  });

  it("the system Back out of fullscreen leaves focus mode", async () => {
    const { onExit } = mount();
    await flush();
    act(() => leave());
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("a refused request is not an exit, and throws nothing", async () => {
    const { onExit } = mount(true, async () => {
      throw new TypeError("no user activation");
    });
    await flush();
    act(() => leave());
    expect(onExit).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });

  it("a refused orientation lock is swallowed; fullscreen stands", async () => {
    lock.mockRejectedValueOnce(new Error("NotSupportedError"));
    const { root, onExit } = mount();
    await flush();
    expect(fullscreenElement).toBe(root);
    expect(onExit).not.toHaveBeenCalled();
  });

  it("turning focus mode off exits the reader's fullscreen — and only the reader's", async () => {
    const { hook } = mount();
    await flush();
    hook.rerender({ on: false });
    expect(exitFullscreen).toHaveBeenCalledTimes(1);

    exitFullscreen.mockClear();
    const other = mount();
    await flush();
    const video = document.createElement("video");
    fullscreenElement = video; // something else took the screen since
    other.hook.rerender({ on: false });
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it("does nothing with a fine pointer (desktop focus mode is unchanged)", async () => {
    coarse = false;
    const { requestFullscreen } = mount();
    await flush();
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("does nothing where element fullscreen is unavailable (iPhone), or something is already fullscreen", async () => {
    enabled = false;
    expect(mount().requestFullscreen).not.toHaveBeenCalled();
    enabled = true;
    fullscreenElement = document.createElement("video");
    expect(mount().requestFullscreen).not.toHaveBeenCalled();
  });

  it("does nothing while focus mode is off", async () => {
    const { requestFullscreen } = mount(false);
    await flush();
    expect(requestFullscreen).not.toHaveBeenCalled();
  });
});
