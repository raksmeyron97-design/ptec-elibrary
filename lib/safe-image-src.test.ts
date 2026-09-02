import { describe, it, expect } from "vitest";
import { isSafeImageSrc } from "./safe-image-src";

describe("isSafeImageSrc", () => {
  it("allows https and http URLs", () => {
    expect(isSafeImageSrc("https://cdn.example.org/cover.jpg")).toBe(true);
    expect(isSafeImageSrc("http://cdn.example.org/cover.jpg")).toBe(true);
  });

  it("allows a browser-minted blob: object URL", () => {
    expect(isSafeImageSrc("blob:https://library.ptec.edu.kh/abc-123")).toBe(true);
  });

  it("allows a base64 raster-image data URI", () => {
    expect(isSafeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSafeImageSrc("data:image/jpeg;base64,/9j/")).toBe(true);
  });

  it("rejects an SVG data URI (can carry an embedded <script>)", () => {
    expect(isSafeImageSrc("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isSafeImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
  });

  it("rejects javascript:, vbscript:, and data:text/html", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeImageSrc("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects empty, null and undefined", () => {
    expect(isSafeImageSrc("")).toBe(false);
    expect(isSafeImageSrc(null)).toBe(false);
    expect(isSafeImageSrc(undefined)).toBe(false);
  });

  it("trims surrounding whitespace before checking", () => {
    expect(isSafeImageSrc("   https://cdn.example.org/x.jpg   ")).toBe(true);
    expect(isSafeImageSrc("   javascript:alert(1)")).toBe(false);
  });

  it("rejects a relative path and other malformed/non-absolute input", () => {
    expect(isSafeImageSrc("relative/path.jpg")).toBe(false);
    expect(isSafeImageSrc("not a url")).toBe(false);
    expect(isSafeImageSrc("//evil.example/x.jpg")).toBe(false);
  });
});
