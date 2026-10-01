import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// SEO Phase 6 (F15): the record page's cover is its LCP element on a phone,
// in a 220px slot. Its `sizes` must say so, and must not contain a bare `NNvw`
// — next/image then filters the srcset to widths >= deviceSizes[0] (640), and
// the phone downloads a 640w file for a 220px box.
const src = readFileSync(path.join(__dirname, "PDFCover.tsx"), "utf8");
const sizes = src.match(/sizes="([^"]+)"/)?.[1] ?? "";

// The exact rule next/image applies (node_modules/next/dist/shared/lib/get-img-props.js).
const NEXT_VIEWPORT_WIDTH_RE = /(^|\s)(1?\d?\d)vw/g;

describe("PDFCover sizes", () => {
  it("describes the phone slot, not the viewport", () => {
    expect(sizes).toMatch(/^\(max-width: 639px\) 220px,/);
  });
  it("holds no bare vw, so the srcset keeps the widths a phone needs", () => {
    expect([...sizes.matchAll(NEXT_VIEWPORT_WIDTH_RE)]).toEqual([]);
  });
  it("the regex really is next/image's, and still catches a bare 100vw", () => {
    const next = readFileSync(path.join(__dirname, "../../../node_modules/next/dist/shared/lib/get-img-props.js"), "utf8");
    expect(next).toContain(String.raw`/(^|\s)(1?\d?\d)vw/g`);
    expect([..."(max-width: 768px) 100vw, 300px".matchAll(NEXT_VIEWPORT_WIDTH_RE)].length).toBe(1);
  });
});
