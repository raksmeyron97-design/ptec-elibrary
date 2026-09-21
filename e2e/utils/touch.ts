import type { CDPSession, Page } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Real touch input for gesture specs.
//
// Playwright's `page.touchscreen` can only TAP. The synthetic `TouchEvent`s
// some specs dispatch (reader-interaction's swipe) reach the reader's own
// listeners but produce no pointer events and no native scroll — so a spec
// built on them cannot see a finger scroll the viewport, or a sheet follow a
// finger. `Input.dispatchTouchEvent` goes through Chromium's real input
// pipeline instead: touch events, pointer events, and a real (touch-action
// honouring) scroll, exactly as a finger produces them.
//
// Chromium only — CDP does not exist on WebKit. Callers skip with a reason:
//   test.skip(browserName !== "chromium", "CDP touch input is Chromium-only");
//
// `Input.synthesizeScrollGesture` is NOT a substitute: it scrolls the
// document, not an inner scroller like the reader's viewport or a sheet body.
// ─────────────────────────────────────────────────────────────────────────────

type Point = { x: number; y: number };

export type DragOptions = {
  /** touchMove events between start and end (default 12). */
  steps?: number;
  /** Delay between moves, ms (default 16 — one frame). */
  stepDelay?: number;
  /** Keep the finger still at the end for this long before lifting (default 0).
   *  A pull that pauses before the lift is not a flick. */
  holdMs?: number;
};

const sessions = new WeakMap<Page, Promise<CDPSession>>();
function cdp(page: Page): Promise<CDPSession> {
  let s = sessions.get(page);
  if (!s) {
    s = page.context().newCDPSession(page);
    sessions.set(page, s);
  }
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One finger, `from` → `to`, then lifted. */
export async function touchDrag(page: Page, from: Point, to: Point, opts: DragOptions = {}): Promise<void> {
  const { steps = 12, stepDelay = 16, holdMs = 0 } = opts;
  const session = await cdp(page);
  const point = (p: Point) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from) });
  for (let i = 1; i <= steps; i++) {
    await sleep(stepDelay);
    const t = i / steps;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
    });
  }
  if (holdMs > 0) {
    // Report the finger as still there: a real hold keeps emitting moves at
    // the same point, which is what a velocity estimate reads.
    const until = Date.now() + holdMs;
    while (Date.now() < until) {
      await sleep(Math.min(stepDelay, holdMs));
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(to) });
    }
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** A finger scroll of the content DOWN by roughly `distance` px: the finger
 *  moves UP from `at`. */
export function fingerScrollDown(page: Page, at: Point, distance: number, opts?: DragOptions): Promise<void> {
  return touchDrag(page, at, { x: at.x, y: at.y - distance }, opts);
}
