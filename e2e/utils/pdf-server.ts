import { createServer, type Server } from "node:http";
import type { Page } from "@playwright/test";

/**
 * A real HTTP server for a generated PDF, so the specs measure what pdf.js
 * actually pulls over the wire rather than what a `route.fulfill()` handed
 * the browser in one piece.
 *
 * `route.fulfill()` cannot tell whether the browser consumed the body or
 * cancelled after the headers — the whole point of the large-file specs.
 * This server writes the body in 64 KB pieces with back-pressure and records,
 * per response, how many bytes it managed to push before the client went
 * away. A cancelled full-document request therefore shows up as a request
 * with `status: 200` and a small `bytes`; a streamed one shows the file size.
 *
 * Range semantics follow RFC 9110: `bytes=a-b`, `bytes=a-`, `bytes=-n`,
 * 206 + Content-Range, 416 when unsatisfiable, `Accept-Ranges: bytes`
 * everywhere, `Cache-Control: private, no-store` like the real route.
 */
export type ServedRequest = {
  range: string | null;
  status: number;
  /** Bytes actually written before the response finished or was aborted. */
  bytes: number;
  aborted: boolean;
  method: string;
};

export type PdfServer = {
  url: string;
  requests: ServedRequest[];
  totalBytes: () => number;
  rangeRequests: () => ServedRequest[];
  fullRequests: () => ServedRequest[];
  reset: () => void;
  close: () => Promise<void>;
};

const PIECE = 64 * 1024;

export async function startPdfServer(pdf: Buffer, opts: { delayMs?: number } = {}): Promise<PdfServer> {
  const requests: ServedRequest[] = [];
  const server: Server = createServer((req, res) => {
    const entry: ServedRequest = {
      range: req.headers.range ?? null,
      status: 200,
      bytes: 0,
      aborted: false,
      method: req.method ?? "GET",
    };
    requests.push(entry);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", 'inline; filename="test.pdf"');

    let start = 0;
    let end = pdf.length - 1;
    if (entry.range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(entry.range.trim());
      if (!m || (m[1] === "" && m[2] === "")) {
        entry.status = 416;
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${pdf.length}`);
        res.end();
        return;
      }
      if (m[1] === "") {
        // suffix range: last n bytes
        const n = Math.min(Number(m[2]), pdf.length);
        start = pdf.length - n;
      } else {
        start = Number(m[1]);
        if (m[2] !== "") end = Math.min(Number(m[2]), pdf.length - 1);
      }
      if (start > end || start >= pdf.length) {
        entry.status = 416;
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${pdf.length}`);
        res.end();
        return;
      }
      entry.status = 206;
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${pdf.length}`);
    }
    res.setHeader("Content-Length", String(end - start + 1));
    if (req.method === "HEAD") {
      res.end();
      return;
    }

    let offset = start;
    let closed = false;
    res.on("close", () => {
      closed = true;
      if (!res.writableFinished) entry.aborted = true;
    });
    const pump = () => {
      if (closed) return;
      while (offset <= end) {
        const piece = pdf.subarray(offset, Math.min(end + 1, offset + PIECE));
        offset += piece.length;
        const ok = res.write(piece);
        entry.bytes += piece.length;
        if (!ok) {
          res.once("drain", () => (opts.delayMs ? setTimeout(pump, opts.delayMs) : pump()));
          return;
        }
      }
      res.end();
    };
    if (opts.delayMs) setTimeout(pump, opts.delayMs);
    else pump();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/file.pdf`,
    requests,
    totalBytes: () => requests.reduce((s, r) => s + r.bytes, 0),
    rangeRequests: () => requests.filter((r) => r.range !== null),
    fullRequests: () => requests.filter((r) => r.range === null && r.method === "GET"),
    reset: () => {
      requests.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/**
 * Send the reader's file-route requests to the test server instead of the
 * app. The browser still believes it is talking to `/api/books/<id>/file`, so
 * same-origin logic (Cache Storage keys, telemetry paths) is untouched; only
 * the bytes come from the server above.
 */
export async function routeBookFileTo(page: Page, server: PdfServer): Promise<void> {
  await page.route("**/api/books/*/file*", (route) => route.continue({ url: server.url }));
}
