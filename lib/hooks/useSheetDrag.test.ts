import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_FRACTION, CLOSE_VELOCITY, HOLD_MS, useSheetDrag } from "./useSheetDrag";

// jsdom has no Touch constructor and lays nothing out. The hook reads
// `touches`, coordinates, `cancelable` and `timeStamp`, so a plain Event
// carrying those is the same input; the sheet's height is stubbed.
const HEIGHT = 400;
type Pt = { clientX: number; clientY: number };

function touchEvent(target: Element, type: string, pts: Pt[], t: number, cancelable = true): Event {
  const e = Object.assign(new Event(type, { bubbles: true, cancelable }), { touches: pts, changedTouches: pts });
  Object.defineProperty(e, "timeStamp", { value: t });
  target.dispatchEvent(e);
  return e;
}

function setup() {
  const scrim = document.createElement("div");
  const sheet = document.createElement("div");
  sheet.getBoundingClientRect = () => ({ height: HEIGHT, width: 360, top: 400, left: 0, right: 360, bottom: 800, x: 0, y: 400, toJSON: () => ({}) });
  const handle = document.createElement("div");
  const body = document.createElement("div");
  body.setAttribute("data-sheet-body", "");
  const row = document.createElement("a");
  const field = document.createElement("input");
  body.append(row, field);
  sheet.append(handle, body);
  document.body.append(scrim, sheet);
  const onClose = vi.fn();
  const hook = renderHook(() => useSheetDrag({ sheetRef: { current: sheet }, scrimRef: { current: scrim }, enabled: true, onClose }));

  /** One finger from y0 down by `dy` in `steps` moves, `stepMs` apart; lifted
   *  `holdMs` after the last move. Returns the first move's event. */
  function pull(from: Element, dy: number, { steps = 8, stepMs = 16, holdMs = 0, dx = 0 } = {}) {
    let t = 1000;
    const y0 = 500;
    touchEvent(from, "touchstart", [{ clientX: 100, clientY: y0 }], t);
    let first: Event | null = null;
    for (let i = 1; i <= steps; i++) {
      t += stepMs;
      const e = touchEvent(from, "touchmove", [{ clientX: 100 + (dx * i) / steps, clientY: y0 + (dy * i) / steps }], t);
      first ??= e;
    }
    touchEvent(from, "touchend", [], t + holdMs);
    return first!;
  }
  return { sheet, scrim, handle, body, row, field, onClose, hook, pull };
}

const atRest = (sheet: HTMLElement, scrim: HTMLElement) => {
  expect(sheet.style.transform).toBe("translateY(0)");
  expect(sheet.style.transition).toBe("");
  expect(scrim.style.opacity).toBe("1");
};

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("useSheetDrag — pull a sheet down to close it", () => {
  it("a long, slow pull closes", () => {
    const { handle, onClose, pull } = setup();
    pull(handle, HEIGHT * CLOSE_FRACTION + 40, { steps: 20, stepMs: 60 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a short, slow pull springs back — the sheet and the scrim", () => {
    const { sheet, scrim, handle, onClose, pull } = setup();
    pull(handle, 60, { steps: 10, stepMs: 60 });
    expect(onClose).not.toHaveBeenCalled();
    atRest(sheet, scrim);
  });

  it("while dragging, the sheet follows the finger and the scrim fades, with no transition", () => {
    const { sheet, scrim, handle } = setup();
    touchEvent(handle, "touchstart", [{ clientX: 100, clientY: 500 }], 1000);
    const move = touchEvent(handle, "touchmove", [{ clientX: 100, clientY: 600 }], 1016);
    expect(move.defaultPrevented).toBe(true); // claimed before the browser can scroll or rubber-band
    expect(sheet.style.transform).toBe("translateY(100px)");
    expect(sheet.style.transition).toBe("none");
    expect(Number(scrim.style.opacity)).toBeCloseTo(1 - 100 / HEIGHT);
  });

  it("a fast, short flick closes; the same distance with a pause before the lift does not", () => {
    const flick = setup();
    // 60 px in 64 ms ≈ 0.94 px/ms — well past CLOSE_VELOCITY, far short of a quarter.
    flick.pull(flick.handle, 60, { steps: 4, stepMs: 16 });
    expect(flick.onClose).toHaveBeenCalledTimes(1);
    expect(60 / 64).toBeGreaterThan(CLOSE_VELOCITY);

    document.body.innerHTML = "";
    const hold = setup();
    hold.pull(hold.handle, 60, { steps: 4, stepMs: 16, holdMs: HOLD_MS + 60 });
    expect(hold.onClose).not.toHaveBeenCalled();
    atRest(hold.sheet, hold.scrim);
  });

  it("a list scrolled down scrolls first: the pull is not claimed", () => {
    const { sheet, body, row, onClose, pull } = setup();
    body.scrollTop = 80;
    const first = pull(row, 300, { steps: 10, stepMs: 60 });
    expect(first.defaultPrevented).toBe(false);
    expect(sheet.style.transform).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the same list at its top: the pull closes", () => {
    const { body, row, onClose, pull } = setup();
    body.scrollTop = 0;
    pull(row, 300, { steps: 10, stepMs: 60 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("an upward or sideways first move is a scroll for the whole touch", () => {
    const up = setup();
    up.pull(up.handle, -200);
    expect(up.sheet.style.transform).toBe("");
    document.body.innerHTML = "";
    const side = setup();
    side.pull(side.handle, 150, { dx: 300 });
    expect(side.sheet.style.transform).toBe("");
    expect(side.onClose).not.toHaveBeenCalled();
  });

  it("a first move the browser has already committed (not cancelable) is left alone", () => {
    const { sheet, handle, onClose } = setup();
    touchEvent(handle, "touchstart", [{ clientX: 100, clientY: 500 }], 1000);
    touchEvent(handle, "touchmove", [{ clientX: 100, clientY: 700 }], 1016, false);
    touchEvent(handle, "touchmove", [{ clientX: 100, clientY: 800 }], 1032);
    touchEvent(handle, "touchend", [], 1040);
    expect(sheet.style.transform).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a second finger mid-pull springs the sheet back instead of leaving it hanging", () => {
    const { sheet, scrim, handle, onClose } = setup();
    touchEvent(handle, "touchstart", [{ clientX: 100, clientY: 500 }], 1000);
    touchEvent(handle, "touchmove", [{ clientX: 100, clientY: 650 }], 1016);
    touchEvent(handle, "touchstart", [{ clientX: 100, clientY: 650 }, { clientX: 200, clientY: 600 }], 1030);
    touchEvent(handle, "touchend", [], 1050);
    expect(onClose).not.toHaveBeenCalled();
    atRest(sheet, scrim);
  });

  it("a cancelled touch (the OS took it) springs back, however far or fast it went", () => {
    const { sheet, scrim, handle, onClose } = setup();
    touchEvent(handle, "touchstart", [{ clientX: 100, clientY: 500 }], 1000);
    touchEvent(handle, "touchmove", [{ clientX: 100, clientY: 800 }], 1016);
    touchEvent(handle, "touchcancel", [], 1020);
    expect(onClose).not.toHaveBeenCalled();
    atRest(sheet, scrim);
  });

  it("a touch that starts in a field keeps the field's own gestures", () => {
    const { sheet, field, onClose, pull } = setup();
    pull(field, 300, { steps: 10, stepMs: 60 });
    expect(sheet.style.transform).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });
});
