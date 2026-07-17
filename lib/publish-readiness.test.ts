import { describe, expect, it } from "vitest";
import { checkBookPublishReady, checkThesisPublishReady } from "@/lib/publish-readiness";

describe("checkBookPublishReady", () => {
  const ready = { title: "Teaching Mathematics", slug: "teaching-mathematics", hasFile: true };

  it("passes a complete book", () => {
    expect(checkBookPublishReady(ready)).toBeNull();
  });

  it("blocks missing/blank title", () => {
    expect(checkBookPublishReady({ ...ready, title: null })).toMatch(/title/i);
    expect(checkBookPublishReady({ ...ready, title: "   " })).toMatch(/title/i);
  });

  it("blocks a missing slug", () => {
    expect(checkBookPublishReady({ ...ready, slug: "" })).toMatch(/slug/i);
  });

  it("blocks a book without a readable file", () => {
    expect(checkBookPublishReady({ ...ready, hasFile: false })).toMatch(/file/i);
  });
});

describe("checkThesisPublishReady", () => {
  it("ignores records not moving to published/scheduled", () => {
    expect(checkThesisPublishReady({ status: "draft", title: "Report" })).toBeNull();
  });

  it("blocks a generic title unless the official title was verified", () => {
    const generic = checkThesisPublishReady({ status: "published", title: "Report" });
    expect(generic).toMatch(/generic/i);

    // With the verification flag the generic-title rule steps aside and the
    // field validation takes over (which will flag other missing fields).
    const verified = checkThesisPublishReady({
      status: "published",
      title: "Report",
      official_title_verified: true,
    });
    expect(verified).not.toMatch(/generic/i);
  });
});
