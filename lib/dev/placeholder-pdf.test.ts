import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPlaceholderPdf, isPlaceholderPdfEnabled, placeholderPdfResponse } from "./placeholder-pdf";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isPlaceholderPdfEnabled", () => {
  it("is IMPOSSIBLE in production, whatever else is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isPlaceholderPdfEnabled()).toBe(false);
    vi.stubEnv("DEV_PLACEHOLDER_PDF", "on");
    expect(isPlaceholderPdfEnabled()).toBe(false);
  });

  it("is on by default outside production, and can be switched off", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isPlaceholderPdfEnabled()).toBe(true);
    vi.stubEnv("DEV_PLACEHOLDER_PDF", "off");
    expect(isPlaceholderPdfEnabled()).toBe(false);
  });
});

describe("buildPlaceholderPdf", () => {
  const pdf = buildPlaceholderPdf("Foundations of Education", 4);
  const text = pdf.toString("latin1");

  it("is a real PDF: header, trailer, and a startxref that points at the xref table", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("has cross-reference offsets that actually land on their objects", () => {
    // A PDF with wrong offsets is exactly the kind of "file" that would pass a
    // string check here and fail in pdf.js.
    const xrefStart = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    const table = text.slice(xrefStart);
    const entries = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries.length).toBeGreaterThan(4);
    entries.forEach((offset, i) => {
      expect(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} at ${offset}`).toBe(true);
    });
  });

  it("declares the page count it was asked for", () => {
    expect(text).toContain("/Count 4");
    expect(buildPlaceholderPdf("x", 1).toString("latin1")).toContain("/Count 1");
    // Never a zero-page document, whatever it is handed.
    expect(buildPlaceholderPdf("x", 0).toString("latin1")).toContain("/Count 1");
  });

  it("says on every page that it is not library content", () => {
    const marks = text.match(/Development placeholder - not library content/g) ?? [];
    expect(marks).toHaveLength(4);
  });

  it("carries the title, and neutralises text that would corrupt the document", () => {
    expect(text).toContain("(Foundations of Education) Tj");
    // Unbalanced parens and backslashes are escaped, not passed through.
    const nasty = buildPlaceholderPdf("A (broken\\ title)").toString("latin1");
    expect(nasty).toContain("(A \\(broken\\\\ title\\)) Tj");
    // Khmer cannot render in base-14 Helvetica, so it is dropped rather than
    // written as mojibake — and the document stays valid.
    const khmer = buildPlaceholderPdf("មូលដ្ឋានគ្រឹះ").toString("latin1");
    expect(khmer).toContain("(Untitled) Tj");
  });
});

describe("placeholderPdfResponse", () => {
  const opts = { title: "A Book", rangeHeader: null, disposition: "inline", source: "books/file" };

  it("returns null in production so a caller falls through to its real 404", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(placeholderPdfResponse(opts)).toBeNull();
  });

  it("serves the whole document with an accurate Content-Length", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = placeholderPdfResponse(opts)!;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("x-ptec-placeholder")).toBe("development");
    const body = Buffer.from(await res.arrayBuffer());
    expect(Number(res.headers.get("content-length"))).toBe(body.length);
    expect(body.toString("latin1").startsWith("%PDF")).toBe(true);
  });

  it("never allows itself to be cached", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(placeholderPdfResponse(opts)!.headers.get("cache-control")).toContain("no-store");
  });

  it("honours a byte range, so the reader exercises its real ranged path", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const full = Buffer.from(await placeholderPdfResponse(opts)!.arrayBuffer());
    const res = placeholderPdfResponse({ ...opts, rangeHeader: "bytes=0-99" })!;
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-99/${full.length}`);
    const slice = Buffer.from(await res.arrayBuffer());
    expect(slice).toHaveLength(100);
    expect(slice.equals(full.subarray(0, 100))).toBe(true);
  });

  it("clamps an open-ended and a suffix range to the document", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const full = Buffer.from(await placeholderPdfResponse(opts)!.arrayBuffer());
    const open = placeholderPdfResponse({ ...opts, rangeHeader: "bytes=10-" })!;
    expect(open.headers.get("content-range")).toBe(`bytes 10-${full.length - 1}/${full.length}`);
    const suffix = placeholderPdfResponse({ ...opts, rangeHeader: "bytes=-20" })!;
    expect(suffix.headers.get("content-range")).toBe(
      `bytes ${full.length - 20}-${full.length - 1}/${full.length}`,
    );
  });

  it("falls back to the whole document for a range it cannot satisfy", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const rangeHeader of ["bytes=99999999-", "bytes=abc", "pages=1-2", "bytes=-"]) {
      expect(placeholderPdfResponse({ ...opts, rangeHeader })!.status, rangeHeader).toBe(200);
    }
  });
});
