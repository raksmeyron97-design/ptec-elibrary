import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOUBLE_TAP_MS, EDGE_TAP_ZONE, useReaderGestures, type GestureState } from "./useReaderGestures";

// The tap classifier reads `touches`, `changedTouches`, coordinates and the
// target, so a plain Event carrying those is the same input — jsdom has no
// Touch constructor.
type Pt = { clientX: number; clientY: number };
function touch(target: Element, type: string, touches: Pt[], changed: Pt[] = touches) {
  target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches, changedTouches: changed }));
}
function tap(target: Element, x: number, y = 300) {
  const p = { clientX: x, clientY: y };
  touch(target, "touchstart", [p]);
  touch(target, "touchend", [], [p]);
}

const WIDTH = 400;

function setup(over: Partial<GestureState> = {}) {
  const docArea = document.createElement("div");
  docArea.getBoundingClientRect = () => ({ left: 0, top: 0, right: WIDTH, bottom: 800, width: WIDTH, height: 800, x: 0, y: 0, toJSON: () => ({}) });
  const button = document.createElement("button");
  const hud = document.createElement("div");
  hud.setAttribute("data-reader-hud", "top");
  docArea.append(button, hud);
  document.body.append(docArea);
  const state: GestureState = {
    effectiveScale: 1,
    fitWidthScale: 1,
    fitMode: "width",
    viewMode: "scroll",
    currentPage: 5,
    commitZoom: vi.fn(),
    fitWidth: vi.fn(),
    navigate: vi.fn(),
    controlsVisible: true,
    onTap: vi.fn(),
    ...over,
  };
  const latest = { current: state };
  const hook = renderHook(() =>
    useReaderGestures({
      docAreaRef: { current: docArea },
      containerRef: { current: docArea },
      gestureLayerRef: { current: document.createElement("div") },
      latest,
    }),
  );
  return { docArea, button, hud, state, latest, hook };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useReaderGestures — the single tap", () => {
  it("shows hidden controls at once", () => {
    const { docArea, state } = setup({ controlsVisible: false });
    tap(docArea, 200);
    expect(state.onTap).toHaveBeenCalledTimes(1);
  });

  it("hides visible controls only after the double-tap window", () => {
    const { docArea, state } = setup();
    tap(docArea, 200);
    expect(state.onTap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 1);
    expect(state.onTap).toHaveBeenCalledTimes(1);
  });

  it("a double tap zooms and never blinks the controls", () => {
    const { docArea, state } = setup();
    tap(docArea, 200);
    vi.advanceTimersByTime(100);
    tap(docArea, 205);
    vi.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    expect(state.onTap).not.toHaveBeenCalled();
    expect(state.commitZoom).toHaveBeenCalledTimes(1);
  });

  it("does not toggle the controls back on if they hid themselves inside the window", () => {
    const { docArea, state, latest } = setup();
    tap(docArea, 200);
    latest.current = { ...state, controlsVisible: false }; // the idle timer won the race
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 1);
    expect(state.onTap).not.toHaveBeenCalled();
  });

  it("never fires for a tap on a control or the HUD", () => {
    const { button, hud, state } = setup({ controlsVisible: false });
    tap(button, 200);
    tap(hud, 200, 600);
    vi.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    expect(state.onTap).not.toHaveBeenCalled();
  });

  it("cancels a pending hide on unmount", () => {
    const { docArea, state, hook } = setup();
    tap(docArea, 200);
    hook.unmount();
    vi.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    expect(state.onTap).not.toHaveBeenCalled();
  });
});

describe("useReaderGestures — edge taps turn the page in single mode at fit width", () => {
  const left = WIDTH * EDGE_TAP_ZONE * 0.5;
  const right = WIDTH * (1 - EDGE_TAP_ZONE * 0.5);

  it("the outer fifth turns the page by one, at once, either way", () => {
    const { docArea, state } = setup({ viewMode: "single" });
    tap(docArea, right);
    expect(state.navigate).toHaveBeenLastCalledWith(6);
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 10);
    tap(docArea, left);
    expect(state.navigate).toHaveBeenLastCalledWith(4);
    vi.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    expect(state.onTap).not.toHaveBeenCalled();
  });

  it("two quick edge taps are two page turns, not a turn and a zoom", () => {
    const { docArea, state } = setup({ viewMode: "single" });
    tap(docArea, right);
    vi.advanceTimersByTime(80);
    tap(docArea, right);
    expect(state.navigate).toHaveBeenCalledTimes(2);
    expect(state.commitZoom).not.toHaveBeenCalled();
    expect(state.fitWidth).not.toHaveBeenCalled();
  });

  it("the middle of the page still toggles the controls", () => {
    const { docArea, state } = setup({ viewMode: "single", controlsVisible: false });
    tap(docArea, WIDTH / 2);
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.onTap).toHaveBeenCalledTimes(1);
  });

  it("not in scroll mode, and not while zoomed in", () => {
    const scroll = setup({ controlsVisible: false });
    tap(scroll.docArea, right);
    expect(scroll.state.navigate).not.toHaveBeenCalled();
    expect(scroll.state.onTap).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";

    const zoomed = setup({ viewMode: "single", fitMode: "custom", effectiveScale: 2, controlsVisible: false });
    tap(zoomed.docArea, right);
    expect(zoomed.state.navigate).not.toHaveBeenCalled();
  });
});
