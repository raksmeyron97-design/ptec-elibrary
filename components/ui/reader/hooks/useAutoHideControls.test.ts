import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HIDE_DELAY_MS, HUD_GRACE_MS, SCROLL_HIDE_PX, useAutoHideControls } from "./useAutoHideControls";

// jsdom has no PointerEvent constructor everywhere; the hook only reads
// `pointerType`, so a plain Event carrying one is the same input.
function pointer(el: Element, type: string, pointerType: "touch" | "mouse") {
  el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerType }));
}

function setup() {
  const root = document.createElement("div");
  const hud = document.createElement("div");
  hud.setAttribute("data-reader-hud", "bottom");
  const button = document.createElement("button");
  const slider = document.createElement("input");
  slider.type = "range";
  hud.append(button, slider);
  // An overlay the controls open (Go to page): inside the reader root, but
  // not inside a HUD bar — exactly where ReaderModal renders.
  const overlay = document.createElement("div");
  overlay.setAttribute("data-reader-overlay", "");
  const go = document.createElement("button");
  overlay.append(go);
  const viewport = document.createElement("div");
  root.append(hud, viewport, overlay);
  document.body.append(root);
  const rootRef = { current: root };
  const scrollRef = { current: viewport };
  const hook = renderHook(() => useAutoHideControls({ enabled: true, paused: false, rootRef, scrollRef }));
  const scrollTo = (top: number) =>
    act(() => {
      viewport.scrollTop = top;
      viewport.dispatchEvent(new Event("scroll"));
    });
  const wait = (ms: number) =>
    act(async () => {
      vi.advanceTimersByTime(ms);
    });
  const idle = () => wait(HIDE_DELAY_MS + 200);
  return { root, button, slider, go, viewport, hook, scrollTo, wait, idle };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete document.documentElement.dataset.focusModality;
});

describe("useAutoHideControls — touch reads like a reading app", () => {
  it("a finger on the page does not bring hidden bars back; a tap (toggle) does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { viewport, hook, idle } = setup();
    await idle();
    expect(hook.result.current.visible).toBe(false);

    // Scrolling with a finger: pointerdown + moves on the page.
    act(() => {
      pointer(viewport, "pointerdown", "touch");
      pointer(viewport, "pointermove", "touch");
      pointer(viewport, "pointerup", "touch");
    });
    expect(hook.result.current.visible).toBe(false);

    act(() => hook.result.current.toggle());
    expect(hook.result.current.visible).toBe(true);
    act(() => hook.result.current.toggle());
    expect(hook.result.current.visible).toBe(false);
  });

  it("scrolling the book down on touch hides the bars; scrolling up does not bring them back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { viewport, hook, scrollTo } = setup();
    act(() => hook.result.current.show());
    act(() => pointer(viewport, "pointerdown", "touch"));
    scrollTo(SCROLL_HIDE_PX - 10);
    expect(hook.result.current.visible).toBe(true); // under the slop
    scrollTo(SCROLL_HIDE_PX + 16);
    expect(hook.result.current.visible).toBe(false);
    scrollTo(0);
    expect(hook.result.current.visible).toBe(false);
  });

  it("a scroll just after touching the controls is the control's doing, not reading on", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { button, hook, scrollTo } = setup();
    act(() => pointer(button, "pointerdown", "touch"));
    scrollTo(200);
    expect(hook.result.current.visible).toBe(true);
  });

  it("a jump made from the controls never hides them, however long the drag took", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { slider, viewport, hook, scrollTo, wait } = setup();
    act(() => hook.result.current.show());
    act(() => pointer(viewport, "pointerdown", "touch")); // read a little…
    await wait(1500); // …then a long scrub, ending in `change`
    act(() => {
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await wait(HUD_GRACE_MS + 300); // past the grace window
    scrollTo(4000); // the jump's own scroll
    expect(hook.result.current.visible).toBe(true);

    // Touching the page again and reading on does hide them.
    act(() => pointer(viewport, "pointerdown", "touch"));
    scrollTo(4040);
    expect(hook.result.current.visible).toBe(false);
  });

  it("the grace window runs from the END of a touch on the controls (a long drag ending in pointercancel)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { slider, viewport, hook, scrollTo, wait } = setup();
    act(() => hook.result.current.show());
    act(() => pointer(slider, "pointerdown", "touch"));
    await wait(HUD_GRACE_MS + 900); // a long drag: the pointerdown stamp has expired
    act(() => pointer(slider, "pointercancel", "touch")); // a range drag may end this way
    // The finger lands on the page a moment later, while the jump is still
    // scrolling: that scroll is the control's doing.
    await wait(100);
    act(() => pointer(viewport, "pointerdown", "touch"));
    scrollTo(3000);
    expect(hook.result.current.visible).toBe(true);
  });

  it("Go to page (an overlay, not a HUD bar) is a control: its jump never hides the bars", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { go, viewport, hook, scrollTo, wait } = setup();
    act(() => hook.result.current.show());
    act(() => pointer(viewport, "pointerdown", "touch"));
    await wait(HUD_GRACE_MS + 300);
    act(() => {
      pointer(go, "pointerdown", "touch");
      pointer(go, "pointerup", "touch");
    });
    await wait(HUD_GRACE_MS + 300); // the jump lands after the grace window
    scrollTo(5000);
    expect(hook.result.current.visible).toBe(true);
  });

  it("a key after a touch makes the next scroll a keyboard scroll, which never hides", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { viewport, hook, scrollTo } = setup();
    act(() => pointer(viewport, "pointerdown", "touch"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
    });
    scrollTo(800);
    expect(hook.result.current.visible).toBe(true);
  });

  it("mouse and wheel keep the desktop rule: movement shows, a wheel scroll does not hide", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { root, hook, scrollTo, idle } = setup();
    await idle();
    expect(hook.result.current.visible).toBe(false);
    act(() => pointer(root, "pointermove", "mouse"));
    expect(hook.result.current.visible).toBe(true);
    scrollTo(300);
    expect(hook.result.current.visible).toBe(true);
  });

  it("a mouse press on the page still counts as activity", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { viewport, hook, idle } = setup();
    await idle();
    act(() => pointer(viewport, "pointerdown", "mouse"));
    expect(hook.result.current.visible).toBe(true);
  });

  it("a tapped button's focus does not pin the bars up — but keyboard focus does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { button, hook } = setup();
    act(() => hook.result.current.show());

    document.documentElement.dataset.focusModality = "pointer";
    button.focus();
    act(() => hook.result.current.hide());
    expect(hook.result.current.visible).toBe(false);
    expect(document.activeElement).not.toBe(button);

    act(() => hook.result.current.show());
    document.documentElement.dataset.focusModality = "keyboard";
    button.focus();
    act(() => hook.result.current.hide());
    expect(hook.result.current.visible).toBe(true);
  });

  it("never hides while something modal is open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const root = document.createElement("div");
    document.body.append(root);
    const hook = renderHook(() => useAutoHideControls({ enabled: true, paused: true, rootRef: { current: root } }));
    act(() => hook.result.current.hide());
    expect(hook.result.current.visible).toBe(true);
  });
});
