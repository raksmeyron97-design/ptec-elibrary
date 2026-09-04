import { describe, expect, it } from "vitest";
import { PDF_DOCUMENT_OPTIONS, PDF_WORKER_SRC } from "./pdf-options";

// The network shape of reading, pinned. Each of these came out of a measured
// failure (docs/LARGE-PDF-PERFORMANCE-AUDIT.md); changing one is a decision,
// not a tidy-up.
describe("pdf.js document options", () => {
  it("fetches only what is rendered, in 512 KB ranges, streaming", () => {
    expect(PDF_DOCUMENT_OPTIONS.disableAutoFetch).toBe(true);
    expect(PDF_DOCUMENT_OPTIONS.disableStream).toBe(false);
    expect(PDF_DOCUMENT_OPTIONS.rangeChunkSize).toBe(512 * 1024);
  });
  it("stays on the CSP-safe non-eval path", () => {
    expect(PDF_DOCUMENT_OPTIONS.isEvalSupported).toBe(false);
  });
  it("self-hosts the worker, cMaps and standard fonts — no CDN", () => {
    for (const url of [PDF_WORKER_SRC, PDF_DOCUMENT_OPTIONS.cMapUrl, PDF_DOCUMENT_OPTIONS.standardFontDataUrl]) {
      expect(url.startsWith("/pdf/")).toBe(true);
      expect(url).not.toMatch(/^https?:/);
    }
    expect(PDF_DOCUMENT_OPTIONS.cMapPacked).toBe(true);
  });
});
