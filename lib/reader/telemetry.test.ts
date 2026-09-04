import { describe, expect, it } from "vitest";
import { brokenFileReport, measurePdfTransfer, safePdfPath } from "./telemetry";

describe("safePdfPath", () => {
  it("keeps the path and drops origin, query and fragment", () => {
    expect(safePdfPath("/api/books/abc/file?token=SECRET#x", "https://library.ptec.edu.kh")).toBe("/api/books/abc/file");
    expect(safePdfPath("https://cdn.example/files/book.pdf?sig=SECRET")).toBe("/files/book.pdf");
  });
  it("never leaks a blob URL's identity, and tolerates junk", () => {
    expect(safePdfPath("blob:https://library.ptec.edu.kh/3f2a")).toBe("blob:");
    expect(safePdfPath("data:application/pdf;base64,AAAA")).toBeNull();
    expect(safePdfPath(null)).toBeNull();
    expect(safePdfPath("")).toBeNull();
  });
});

describe("measurePdfTransfer", () => {
  const origin = "https://library.ptec.edu.kh";
  it("counts only the PDF's own requests, including ranges, summing transfer size", () => {
    const entries = [
      { name: `${origin}/api/books/1/file`, transferSize: 1000 },
      { name: `${origin}/api/books/1/file?x=1`, transferSize: 2000 },
      { name: `${origin}/pdf/pdf.worker.min.mjs`, transferSize: 999_999 },
      { name: `${origin}/api/books/2/file`, transferSize: 5 },
    ];
    expect(measurePdfTransfer("/api/books/1/file", entries, origin)).toEqual({ requests: 2, bytes: 3000 });
  });
  it("reports undefined — never zero — when there is nothing to measure", () => {
    expect(measurePdfTransfer("/api/books/1/file", [], origin)).toEqual({ requests: undefined, bytes: undefined });
    expect(measurePdfTransfer("/api/books/1/file", null, origin)).toEqual({ requests: undefined, bytes: undefined });
    expect(measurePdfTransfer("blob:x", [{ name: "blob:x", transferSize: 1 }], origin)).toEqual({ requests: undefined, bytes: undefined });
  });
});

describe("brokenFileReport", () => {
  it("contains the path but no query string, no storage host and no page text", () => {
    const r = brokenFileReport({ title: "T", bookId: "id-1", pdfUrl: "/api/books/id-1/file?sig=SECRET", page: 12 });
    expect(r.subject).toBe("Broken PDF: T");
    expect(r.body).toContain("File: /api/books/id-1/file");
    expect(r.body).not.toContain("SECRET");
    expect(r.body).toContain("Page: 12");
  });
});
