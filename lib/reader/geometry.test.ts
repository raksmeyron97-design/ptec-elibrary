import { describe, expect, it } from "vitest";
import { clampDpr, computeGeometry, MAX_SCROLL_W, PAD, pageRotateProp, SCROLL_PAGE_Y } from "./geometry";

const base = {
  containerWidth: 800,
  containerHeight: 900,
  aspectRatio: 1.4,
  nativeWidth: 600,
  rotation: 0,
  fitMode: "width" as const,
  viewMode: "scroll" as const,
  zoomScale: 1,
};

describe("computeGeometry", () => {
  it("fit-width uses the viewport minus padding", () => {
    const g = computeGeometry(base);
    expect(g.pageWidth).toBe(800 - PAD);
    expect(g.estHeight).toBe(Math.round((800 - PAD) * 1.4));
    expect(g.rowHeight).toBe(g.estHeight + SCROLL_PAGE_Y);
    expect(g.effectiveScale).toBeCloseTo((800 - PAD) / 600);
    expect(g.fitWidthScale).toBeCloseTo(g.effectiveScale);
  });

  it("caps continuous-mode width on very wide screens, but not single-page mode", () => {
    expect(computeGeometry({ ...base, containerWidth: 2400 }).pageWidth).toBe(MAX_SCROLL_W);
    expect(computeGeometry({ ...base, containerWidth: 2400, viewMode: "single" }).pageWidth).toBe(2400 - PAD);
  });

  it("fit-page fits the whole page into the viewport height", () => {
    const g = computeGeometry({ ...base, fitMode: "page" });
    expect(g.pageWidth).toBe(Math.floor((900 - PAD) / 1.4));
  });

  it("custom zoom means actual size × scale once page 1 is measured", () => {
    expect(computeGeometry({ ...base, fitMode: "custom", zoomScale: 1 }).pageWidth).toBe(600);
    expect(computeGeometry({ ...base, fitMode: "custom", zoomScale: 1.5 }).pageWidth).toBe(900);
    expect(computeGeometry({ ...base, fitMode: "custom", zoomScale: 1.5 }).effectiveScale).toBe(1.5);
  });

  it("falls back to fit-width for custom zoom before page 1 is measured", () => {
    const g = computeGeometry({ ...base, fitMode: "custom", nativeWidth: undefined, zoomScale: 1 });
    expect(g.pageWidth).toBe(800 - PAD);
    expect(g.effectiveScale).toBe(1); // reported as the requested scale
  });

  it("swaps the aspect and native width at quarter rotations", () => {
    const g = computeGeometry({ ...base, rotation: 90 });
    expect(g.effAspect).toBeCloseTo(1 / 1.4);
    expect(g.nativeWRot).toBeCloseTo(600 * 1.4);
    expect(computeGeometry({ ...base, rotation: 180 }).effAspect).toBe(1.4);
  });

  it("returns no width until the viewport is measured, with an A4 placeholder height", () => {
    const g = computeGeometry({ ...base, containerWidth: undefined });
    expect(g.pageWidth).toBeUndefined();
    expect(g.estHeight).toBe(600);
  });

  it("never lays out below the minimum page width", () => {
    expect(computeGeometry({ ...base, containerWidth: 40 }).pageWidth).toBe(64);
  });
});

describe("pageRotateProp / clampDpr", () => {
  it("leaves the page's own rotation alone at 0 and adds on top otherwise", () => {
    expect(pageRotateProp(90, 0)).toBeUndefined();
    expect(pageRotateProp(90, 90)).toBe(180);
    expect(pageRotateProp(270, 180)).toBe(90);
  });
  it("caps device pixel ratio at 2 and floors at 1", () => {
    expect(clampDpr(3)).toBe(2);
    expect(clampDpr(0.5)).toBe(1);
    expect(clampDpr(0)).toBe(1);
    expect(clampDpr(1.5)).toBe(1.5);
  });
});
