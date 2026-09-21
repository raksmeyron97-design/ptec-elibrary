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
//
// Every event is STAMPED (`timestamp`) on the timeline the caller asked for,
// and `event.timeStamp` in the page follows it. Without that, a gesture's
// speed is whatever the machine's CDP round trip happens to be: on a loaded
// dev box each dispatch took 30–75 ms to land, so a "fast" 90 px flick
// arrived at 0.45 px/ms and read as a slow pull. Velocity rules (a sheet's
// flick-to-close) are then untestable. Real sleeps still pace the dispatch,
// so layout and scrolling get their frames.
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
  // The gesture's own clock, in seconds (CDP's unit). A step is never
  // stamped closer than 8 ms to the last: no touch screen samples faster.
  const step = Math.max(8, stepDelay);
  let clock = Date.now() / 1000;
  const tick = (ms: number) => (clock += ms / 1000);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from), timestamp: clock });
  for (let i = 1; i <= steps; i++) {
    await sleep(stepDelay);
    const t = i / steps;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
      timestamp: tick(step),
    });
  }
  if (holdMs > 0) {
    // Report the finger as still there: a real hold keeps emitting moves at
    // the same point, which is what a velocity estimate reads.
    for (let held = 0; held < holdMs; held += step) {
      await sleep(step);
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(to), timestamp: tick(step) });
    }
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: tick(step / 2) });
}

/** A finger scroll of the content DOWN by roughly `distance` px: the finger
 *  moves UP from `at`. */
export function fingerScrollDown(page: Page, at: Point, distance: number, opts?: DragOptions): Promise<void> {
  return touchDrag(page, at, { x: at.x, y: at.y - distance }, opts);
}
