// The truncated-PDF rules, pinned to the two real cases that produced them.
//
// Both books were PUBLISHED, both served HTTP 200 with a valid `%PDF-` header,
// and both failed in pdf.js with InvalidPDFException — so every check the
// system already had said they were fine. These are the numbers measured from
// production on 2026-09-09.

import { describe, expect, it } from "vitest";
import {
  TRUNCATION_TOLERANCE,
  classifyPdfIntegrity,
  hasPdfHeader,
  hasPdfTrailer,
  isSizeTruncated,
  sizeRatio,
} from "./pdf-integrity";

/** APA Publication Manual, 7th ed. — lost two thirds of itself. */
const APA = { declaredKb: 30_915, actualBytes: 10_485_051 };
/** Data Analysis with MS Excel, 3rd ed. — 4% short, and just as unopenable. */
const EXCEL = { declaredKb: 10_675, actualBytes: 10_483_690 };
/** APA 6th ed. — a genuinely healthy file, and a cross-reference STREAM PDF. */
const HEALTHY = { declaredKb: 4_801, actualBytes: 4_915_774 };

describe("size truncation", () => {
  it("catches both real truncated books", () => {
    expect(isSizeTruncated(APA.declaredKb, APA.actualBytes)).toBe(true);
    expect(isSizeTruncated(EXCEL.declaredKb, EXCEL.actualBytes)).toBe(true);
  });

  it("leaves the healthy control alone — kilobyte rounding is not truncation", () => {
    expect(isSizeTruncated(HEALTHY.declaredKb, HEALTHY.actualBytes)).toBe(false);
    // The margin is not a lucky threshold: the control is 0.01% off.
    expect(sizeRatio(HEALTHY.declaredKb, HEALTHY.actualBytes)!).toBeGreaterThan(0.999);
  });

  it("separates the two real cases from the tolerance by a wide margin", () => {
    // The closest genuine truncation is still comfortably below the gate.
    expect(sizeRatio(EXCEL.declaredKb, EXCEL.actualBytes)!).toBeLessThan(TRUNCATION_TOLERANCE - 0.01);
    expect(sizeRatio(APA.declaredKb, APA.actualBytes)!).toBeLessThan(0.34);
  });

  it("never manufactures a verdict from a missing number", () => {
    expect(isSizeTruncated(null, 1_000)).toBe(false);
    expect(isSizeTruncated(1_000, null)).toBe(false);
    expect(isSizeTruncated(undefined, undefined)).toBe(false);
    expect(isSizeTruncated(0, 1_000)).toBe(false);
    expect(sizeRatio(null, 10)).toBeNull();
  });

  it("does not call a file larger than its record truncated", () => {
    // Rounding, or a re-upload whose row lagged — not a missing tail.
    expect(isSizeTruncated(100, 200 * 1024)).toBe(false);
  });
});

describe("pdf trailer", () => {
  it("requires startxref AND %%EOF", () => {
    expect(hasPdfTrailer("…startxref\n116\n%%EOF\n")).toBe(true);
    expect(hasPdfTrailer("…startxref\n116\n")).toBe(false);
    expect(hasPdfTrailer("…%%EOF\n")).toBe(false);
  });

  it("accepts a cross-reference STREAM pdf, which carries no `trailer` keyword", () => {
    // The healthy control in this collection is exactly this shape: %%EOF and
    // startxref present, `trailer` absent. Requiring `trailer` would have
    // reported 268 good books as broken.
    expect(hasPdfTrailer("/Type /XRef …\nstartxref\n4915000\n%%EOF")).toBe(true);
  });

  it("rejects the tail both broken books actually had", () => {
    // No startxref, no trailer, no %%EOF — the file simply stops.
    expect(hasPdfTrailer("…stream\n\x00\x01\x02 binary payload cut mid-object")).toBe(false);
  });

  it("recognises a PDF header", () => {
    expect(hasPdfHeader("%PDF-1.7")).toBe(true);
    expect(hasPdfHeader("%PDF-1.5")).toBe(true);
    expect(hasPdfHeader("<!DOCTYPE html>")).toBe(false);
  });
});

describe("classifyPdfIntegrity", () => {
  it("reports the real APA file as truncated from size alone, with no tail read", () => {
    expect(classifyPdfIntegrity({ head: "%PDF-1.7", ...APA })).toEqual({
      ok: false,
      reason: "truncated-size",
    });
  });

  it("catches a file whose recorded size was written from the truncated bytes", () => {
    // Size agrees with itself, so only the tail can tell — this is why both
    // signals exist.
    expect(
      classifyPdfIntegrity({ head: "%PDF-1.4", tail: "cut mid-object", declaredKb: 100, actualBytes: 102_400 }),
    ).toEqual({ ok: false, reason: "truncated-tail" });
  });

  it("passes a healthy file", () => {
    expect(
      classifyPdfIntegrity({ head: "%PDF-1.6", tail: "startxref\n4915000\n%%EOF", ...HEALTHY }),
    ).toEqual({ ok: true });
  });

  it("skips what it was not given rather than guessing", () => {
    expect(classifyPdfIntegrity({})).toEqual({ ok: true });
    expect(classifyPdfIntegrity({ declaredKb: 100 })).toEqual({ ok: true });
  });

  it("calls a non-PDF what it is, before any size reasoning", () => {
    expect(classifyPdfIntegrity({ head: "<!DOCTYPE html>", ...APA })).toEqual({
      ok: false,
      reason: "not-a-pdf",
    });
  });
});
