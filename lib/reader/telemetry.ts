/* Reader telemetry helpers — browser-side, side-effect-free until `send`.

   What is logged: event type, book id, the PDF's PATH (never its query
   string), page, duration, request/byte counts, cache/network source. What is
   never logged: document text, selections, tokens, signed URLs. The route on
   the other end (`/api/reader-events`) clamps and re-validates everything. */

export type ReaderEventType =
  | "pdf_load_error"
  | "pdf_load_slow"
  | "pdf_render_error"
  | "pdf_first_page"
  | "broken_file_report";

export type ReaderEventPayload = {
  type: ReaderEventType;
  bookId: string;
  file: string | null;
  page?: number;
  message?: string;
  durationMs?: number;
  /** How many HTTP requests it took to paint the first page. */
  requests?: number;
  /** How many bytes crossed the network to paint it. */
  bytes?: number;
  /** "cache" when the book was already on the device, else "network". */
  source?: string;
};

/** The PDF URL reduced to a path: no origin, no query string, no token. */
export function safePdfPath(raw: string | null | undefined, origin = "https://library.ptec.edu.kh"): string | null {
  if (!raw) return null;
  if (raw.startsWith("blob:")) return "blob:";
  try {
    const url = new URL(raw, origin);
    // Only web URLs have a path worth logging; any other scheme is opaque.
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.pathname;
  } catch {
    return raw.split("?")[0]?.slice(0, 160) || null;
  }
}

/**
 * What it actually cost to reach the first painted page: real requests —
 * including the byte ranges pdf.js issues — read from Resource Timing, so it
 * counts what the browser did rather than what the component believes it
 * asked for. Returns undefined rather than guessing when Resource Timing is
 * unavailable or the entries have been evicted; a missing measurement must
 * never be reported as a fast one.
 */
export function measurePdfTransfer(
  pdfUrl: string | null | undefined,
  entries: ReadonlyArray<{ name: string; transferSize?: number }> | null,
  origin: string,
): { requests: number | undefined; bytes: number | undefined } {
  try {
    if (!pdfUrl || !entries || pdfUrl.startsWith("blob:")) return { requests: undefined, bytes: undefined };
    const abs = new URL(pdfUrl, origin).href.split("?")[0];
    const mine = entries.filter((e) => e.name.split("?")[0] === abs);
    if (mine.length === 0) return { requests: undefined, bytes: undefined };
    return {
      requests: mine.length,
      // transferSize is 0 for a cross-origin response without
      // Timing-Allow-Origin and for a cache hit; same-origin reports it truthfully.
      bytes: mine.reduce((sum, e) => sum + (e.transferSize || 0), 0),
    };
  } catch {
    return { requests: undefined, bytes: undefined };
  }
}

export function sendReaderEvent(payload: ReaderEventPayload): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/reader-events", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/reader-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* logging must never interrupt reading */
  }
}

/** Body of the "report a broken file" email. Path only — no query string, no
    storage host — and no document content. */
export function brokenFileReport(input: {
  title: string;
  bookId: string;
  pdfUrl: string | null | undefined;
  page: number;
}): { subject: string; body: string } {
  return {
    subject: `Broken PDF: ${input.title}`,
    body:
      `Please check this PDF file.\n\nTitle: ${input.title}\nResource ID: ${input.bookId}\n` +
      `File: ${safePdfPath(input.pdfUrl) ?? "unknown"}\nPage: ${input.page}`,
  };
}
