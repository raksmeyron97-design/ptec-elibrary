import { describe, expect, it } from "vitest";
import {
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_LEVELS,
  clampScale,
  parseZoomInput,
  stepZoom,
} from "./zoom";

describe("stepZoom", () => {
  it("moves to the next preset when sitting on one", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(2.5, 1)).toBe(3);
  });

  it("snaps in-between values to the nearest preset in the direction", () => {
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(1);
    expect(stepZoom(0.6, -1)).toBe(0.5);
  });

  it("clamps at the ends of the range", () => {
    expect(stepZoom(3, 1)).toBe(MAX_SCALE);
    expect(stepZoom(0.5, -1)).toBe(MIN_SCALE);
    expect(stepZoom(5, 1)).toBe(MAX_SCALE);
    expect(stepZoom(0.1, -1)).toBe(MIN_SCALE);
  });

  it("treats float noise as being on a preset", () => {
    expect(stepZoom(1.2500000001, 1)).toBe(1.5);
    expect(stepZoom(0.7499999999, -1)).toBe(0.5);
  });

  it("covers every preset in both directions", () => {
    for (let i = 0; i < ZOOM_LEVELS.length - 1; i++) {
      expect(stepZoom(ZOOM_LEVELS[i], 1)).toBe(ZOOM_LEVELS[i + 1]);
      expect(stepZoom(ZOOM_LEVELS[i + 1], -1)).toBe(ZOOM_LEVELS[i]);
    }
  });
});

describe("parseZoomInput", () => {
  it("parses plain and percent-suffixed numbers", () => {
    expect(parseZoomInput("125")).toBe(1.25);
    expect(parseZoomInput("125%")).toBe(1.25);
    expect(parseZoomInput(" 80 % ")).toBe(0.8);
  });

  it("parses Khmer numerals", () => {
    expect(parseZoomInput("១២៥")).toBe(1.25);
    expect(parseZoomInput("១០០%")).toBe(1);
  });

  it("clamps out-of-range values", () => {
    expect(parseZoomInput("10")).toBe(MIN_SCALE);
    expect(parseZoomInput("900")).toBe(MAX_SCALE);
  });

  it("rejects garbage", () => {
    expect(parseZoomInput("")).toBeNull();
    expect(parseZoomInput("abc")).toBeNull();
    expect(parseZoomInput("-50")).toBeNull();
    expect(parseZoomInput("0")).toBeNull();
  });
});

describe("clampScale", () => {
  it("clamps into [0.5, 3]", () => {
    expect(clampScale(0.2)).toBe(0.5);
    expect(clampScale(4)).toBe(3);
    expect(clampScale(1.5)).toBe(1.5);
  });
});
