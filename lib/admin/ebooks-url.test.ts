import { describe, it, expect } from "vitest";
import {
  EBOOKS_BASE_PATH,
  EBOOKS_DUPLICATES_PATH,
  EBOOKS_REVIEW_PATH,
  EBOOKS_UPLOAD_PATH,
  ebookUploadUrl,
  ebooksFilterUrl,
  withUpdatedParams,
} from "./ebooks-url";
import { withForwardedQuery } from "./legacy-redirect";

describe("canonical Book Management routes", () => {
  it("are the /admin/books family", () => {
    expect(EBOOKS_BASE_PATH).toBe("/admin/books");
    expect(EBOOKS_UPLOAD_PATH).toBe("/admin/books/upload");
    expect(EBOOKS_DUPLICATES_PATH).toBe("/admin/books/duplicates");
  });

  it("sends pending-review uploads to the queue, not the collection", () => {
    expect(EBOOKS_REVIEW_PATH).toBe("/admin/review");
    expect(EBOOKS_REVIEW_PATH).not.toBe(EBOOKS_BASE_PATH);
  });

  it("nests upload and duplicates under the collection", () => {
    expect(EBOOKS_UPLOAD_PATH.startsWith(`${EBOOKS_BASE_PATH}/`)).toBe(true);
    expect(EBOOKS_DUPLICATES_PATH.startsWith(`${EBOOKS_BASE_PATH}/`)).toBe(true);
  });
});

describe("ebooksFilterUrl", () => {
  it("builds a deep link into the collection", () => {
    expect(ebooksFilterUrl({ status: "published" })).toBe("/admin/books?status=published");
  });

  it("drops empty values rather than emitting ?status=", () => {
    expect(ebooksFilterUrl({ status: "", quality: undefined, dept: null })).toBe("/admin/books");
  });

  it("encodes user text", () => {
    expect(ebooksFilterUrl({ q: "khmer maths" })).toBe("/admin/books?q=khmer+maths");
  });
});

describe("ebookUploadUrl", () => {
  it("prefills the title from a search gap", () => {
    expect(ebookUploadUrl("Algebra 12")).toBe("/admin/books/upload?title=Algebra%2012");
  });

  it("omits the param when there is no title", () => {
    expect(ebookUploadUrl()).toBe("/admin/books/upload");
    expect(ebookUploadUrl("   ")).toBe("/admin/books/upload");
  });
});

describe("withUpdatedParams", () => {
  it("resets the page whenever a filter changes", () => {
    const current = new URLSearchParams("status=draft&page=4");
    expect(withUpdatedParams(current, { status: "published" })).toBe("/admin/books?status=published");
  });

  it("keeps the page when only the page changes", () => {
    const current = new URLSearchParams("status=draft");
    expect(withUpdatedParams(current, { page: "3" })).toBe("/admin/books?status=draft&page=3");
  });

  it("drops a cleared filter", () => {
    const current = new URLSearchParams("status=draft&dept=Maths");
    expect(withUpdatedParams(current, { status: null })).toBe("/admin/books?dept=Maths");
  });
});

describe("legacy redirects preserve URL state", () => {
  it("carries a filter from /admin/manage to /admin/books", () => {
    expect(withForwardedQuery(EBOOKS_BASE_PATH, { status: "published" })).toBe(
      "/admin/books?status=published",
    );
  });

  it("carries the ?title= prefill from /admin/upload", () => {
    expect(withForwardedQuery(EBOOKS_UPLOAD_PATH, { title: "Algebra 12" })).toBe(
      "/admin/books/upload?title=Algebra+12",
    );
  });

  it("keeps every value of a repeated param", () => {
    expect(withForwardedQuery(EBOOKS_BASE_PATH, { dept: ["Maths", "Science"] })).toBe(
      "/admin/books?dept=Maths&dept=Science",
    );
  });

  it("emits a bare path when there is nothing to carry", () => {
    expect(withForwardedQuery(EBOOKS_DUPLICATES_PATH, {})).toBe("/admin/books/duplicates");
    expect(withForwardedQuery(EBOOKS_DUPLICATES_PATH, { page: undefined, q: "" })).toBe(
      "/admin/books/duplicates",
    );
  });
});
