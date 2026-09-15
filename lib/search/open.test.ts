import { afterEach, describe, expect, it } from "vitest";
import { openSearchOverlay, SEARCH_OPEN_EVENT, type SearchOpenDetail } from "./open";

describe("openSearchOverlay", () => {
  const listeners: Array<(event: Event) => void> = [];
  const listen = (listener: (event: Event) => void) => {
    listeners.push(listener);
    window.addEventListener(SEARCH_OPEN_EVENT, listener);
  };
  afterEach(() => {
    for (const listener of listeners.splice(0)) window.removeEventListener(SEARCH_OPEN_EVENT, listener);
  });

  it("reports unhandled when no overlay is mounted, so the caller's link navigates", () => {
    expect(openSearchOverlay()).toBe(false);
  });

  it("runs the overlay before returning — inside the caller's tap, where focus raises the keyboard", () => {
    const order: string[] = [];
    listen((event) => {
      order.push("overlay");
      (event as CustomEvent<SearchOpenDetail>).detail.handled = true;
    });
    const handled = openSearchOverlay();
    order.push("returned");
    expect(handled).toBe(true);
    expect(order).toEqual(["overlay", "returned"]);
  });
});
