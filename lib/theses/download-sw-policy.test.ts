import { describe, it, expect } from "vitest";
import { isBookFileRequest, isPrivateRequest, FILE_ROUTE_RE } from "@/lib/sw-policy";

// Phase 13 (Cache & PWA safety): the gated thesis DOWNLOAD route must never be
// treated as an offline-cacheable "book file", and must be classified private
// so the service worker uses NetworkOnly (never stores the PDF or the decision).
describe("service-worker classification of the thesis download route", () => {
  const download = "/api/theses/abc-123/download";
  const status = "/api/theses/abc-123/download-status";
  const preview = "/api/theses/abc-123/file";

  it("download route is NOT a cacheable book-file request", () => {
    expect(FILE_ROUTE_RE.test(download)).toBe(false);
    expect(isBookFileRequest({ pathname: download, sameOrigin: true })).toBe(false);
  });

  it("download + status routes are private (NetworkOnly)", () => {
    expect(isPrivateRequest({ pathname: download, sameOrigin: true, hasAuthorizationHeader: false })).toBe(true);
    expect(isPrivateRequest({ pathname: status, sameOrigin: true, hasAuthorizationHeader: false })).toBe(true);
  });

  it("the preview /file route stays a book-file request (offline reading unaffected)", () => {
    expect(FILE_ROUTE_RE.test(preview)).toBe(true);
    expect(isBookFileRequest({ pathname: preview, sameOrigin: true })).toBe(true);
  });
});
