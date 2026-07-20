import { describe, expect, it } from "vitest";
import {
  normalizeStatus,
  normalizeType,
  normalizePriority,
  normalizeAudienceType,
  isBilingualComplete,
  hasAnyChannel,
  truncatePreview,
  STATUSES,
} from "./shared";

describe("normalize* helpers", () => {
  it("normalizeStatus falls back to 'draft' for an unknown/missing value", () => {
    expect(normalizeStatus("not-a-real-status")).toBe("draft");
    expect(normalizeStatus(null)).toBe("draft");
    expect(normalizeStatus(undefined)).toBe("draft");
  });

  it("normalizeStatus accepts every declared status", () => {
    for (const s of STATUSES) expect(normalizeStatus(s)).toBe(s);
  });

  it("normalizeType falls back to 'general'", () => {
    expect(normalizeType("bogus")).toBe("general");
  });

  it("normalizePriority falls back to 'normal'", () => {
    expect(normalizePriority("bogus")).toBe("normal");
  });

  it("normalizeAudienceType falls back to 'all_active'", () => {
    expect(normalizeAudienceType("bogus")).toBe("all_active");
  });
});

describe("isBilingualComplete", () => {
  it("is false when the Khmer title is empty or whitespace", () => {
    expect(isBilingualComplete(null)).toBe(false);
    expect(isBilingualComplete("")).toBe(false);
    expect(isBilingualComplete("   ")).toBe(false);
  });

  it("is true when a Khmer title is present", () => {
    expect(isBilingualComplete("ចំណងជើង")).toBe(true);
  });
});

describe("hasAnyChannel", () => {
  it("is false when every channel is off", () => {
    expect(hasAnyChannel({ inApp: false, banner: false, push: false })).toBe(false);
  });

  it("is true when at least one channel is on", () => {
    expect(hasAnyChannel({ inApp: true, banner: false, push: false })).toBe(true);
  });
});

describe("truncatePreview", () => {
  it("returns the original text untruncated when under the limit", () => {
    const result = truncatePreview("short", 20);
    expect(result).toEqual({ text: "short", truncated: false });
  });

  it("truncates and marks text over the limit", () => {
    const result = truncatePreview("a very long title that exceeds the limit", 10);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(10);
    expect(result.text.endsWith("…")).toBe(true);
  });
});
