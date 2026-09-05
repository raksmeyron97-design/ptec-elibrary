import { describe, expect, it } from "vitest";
import {
  READER_BUDGETS,
  canvasBytes,
  classifyDevice,
  deviceBudgetClass,
  maxPagesByCanvasBudget,
  prefetchWindowSize,
} from "./budgets";

const MiB = 1024 * 1024;

describe("reader budgets", () => {
  it("pins the constants the verification document cites", () => {
    expect(READER_BUDGETS.MAX_MOUNTED_PAGES).toBe(12);
    expect(READER_BUDGETS.MAX_PREFETCH_PAGES).toEqual({ slow: 2, normal: 4, fast: 6 });
    expect(READER_BUDGETS.MAX_CONCURRENT_PREFETCH).toBe(2);
    expect(READER_BUDGETS.MAX_SEARCH_MATCHES).toBe(500);
    expect(READER_BUDGETS.IDLE_CLEANUP_MS).toBe(30_000);
    expect(READER_BUDGETS.RECONNECT_BACKOFF_MS.at(-1)).toBe(30_000);
    // The tiers are ordered: a faster link never gets a smaller budget.
    expect(READER_BUDGETS.MAX_PREFETCH_BYTES.slow).toBeLessThan(READER_BUDGETS.MAX_PREFETCH_BYTES.normal);
    expect(READER_BUDGETS.MAX_PREFETCH_BYTES.normal).toBeLessThan(READER_BUDGETS.MAX_PREFETCH_BYTES.fast);
  });

  it("measures a canvas in bytes at the rendered DPR", () => {
    // 1,000 px fit-width page at A4 aspect, DPR 2: 2,000 × 2,829 × 4.
    expect(canvasBytes(1000, 1414.2, 2)).toBe(2000 * 2829 * 4);
    expect(canvasBytes(0, 100, 2)).toBe(0);
  });

  it("caps mounted pages by the canvas budget, never below one", () => {
    const perPage = canvasBytes(1000, 1414, 2); // ≈ 22.6 MB
    expect(maxPagesByCanvasBudget(perPage, "touch")).toBe(4); // 96 MB / 22.6 MB
    expect(maxPagesByCanvasBudget(perPage, "desktop")).toBe(11); // 256 MB / 22.6 MB
    expect(maxPagesByCanvasBudget(10 * 96 * MiB, "touch")).toBe(1);
    expect(maxPagesByCanvasBudget(0, "touch")).toBe(READER_BUDGETS.MAX_MOUNTED_PAGES);
  });

  describe("prefetchWindowSize", () => {
    const phone = { visibleCount: 2, perPageCanvasBytes: canvasBytes(358, 506, 2), device: "touch" as const };

    it("follows the tier when nothing else binds", () => {
      expect(prefetchWindowSize({ tier: "slow", ...phone })).toBe(2);
      expect(prefetchWindowSize({ tier: "normal", ...phone })).toBe(4);
      expect(prefetchWindowSize({ tier: "fast", ...phone })).toBe(6);
    });

    it("shrinks for a heavy document on the same link", () => {
      // A 100 MB scanned book with 200 pages: 500 KB a page.
      const bytesPerPage = 500 * 1024;
      expect(prefetchWindowSize({ tier: "slow", ...phone, bytesPerPage })).toBe(2); // 1 MB / 500 KB
      expect(prefetchWindowSize({ tier: "normal", ...phone, bytesPerPage: 2 * MiB })).toBe(2); // 4 MB / 2 MB
      expect(prefetchWindowSize({ tier: "fast", ...phone, bytesPerPage: 4 * MiB })).toBe(3); // 12 MB / 4 MB
      // A text PDF is cheap enough that the page budget binds instead.
      expect(prefetchWindowSize({ tier: "fast", ...phone, bytesPerPage: 20 * 1024 })).toBe(6);
    });

    it("shrinks when the canvas budget is nearly spent by the visible pages", () => {
      const tablet = { visibleCount: 2, perPageCanvasBytes: canvasBytes(992, 1403, 2), device: "touch" as const };
      // 96 MB / 22.3 MB = 4 pages fit; 2 are visible → 2 of overscan, not 6.
      expect(prefetchWindowSize({ tier: "fast", ...tablet })).toBe(2);
      const desktop = { ...tablet, device: "desktop" as const };
      expect(prefetchWindowSize({ tier: "fast", ...desktop })).toBe(6);
    });

    it("never exceeds the hard mount cap", () => {
      const tiny = { visibleCount: 8, perPageCanvasBytes: 1000, device: "desktop" as const };
      expect(prefetchWindowSize({ tier: "fast", ...tiny })).toBe(4); // 12 − 8
      expect(prefetchWindowSize({ tier: "fast", ...tiny, visibleCount: 12 })).toBe(0);
    });
  });

  it("classifies devices coarsely, from capabilities not user agents", () => {
    expect(classifyDevice({ coarsePointer: false, viewportWidth: 390 })).toBe("desktop");
    expect(classifyDevice({ coarsePointer: true, viewportWidth: 390 })).toBe("phone");
    expect(classifyDevice({ coarsePointer: true, viewportWidth: 1024 })).toBe("tablet");
    expect(deviceBudgetClass("phone")).toBe("touch");
    expect(deviceBudgetClass("tablet")).toBe("touch");
    expect(deviceBudgetClass("desktop")).toBe("desktop");
  });
});
