/* pdf.js document options and worker location — pinned in one module so a
   change to the network shape of reading (chunk size, autofetch, streaming)
   is a deliberate edit here and nowhere else. `pdf-options.test.ts` asserts
   these values; read docs/LARGE-PDF-PERFORMANCE-AUDIT.md before moving one.

   Worker, cMaps and standard fonts are SELF-HOSTED under /public/pdf
   (scripts/copy-pdf-assets.mjs copies them from the exact pdfjs-dist version
   react-pdf bundles) so the reader works offline and never touches a CDN. */

export const PDF_WORKER_SRC = "/pdf/pdf.worker.min.mjs";

export const PDF_DOCUMENT_OPTIONS = {
  cMapUrl: "/pdf/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdf/standard_fonts/",
  // Forces pdf.js onto its non-eval PostScript path so the CSP can drop
  // 'unsafe-eval' (docs/SECURITY-HEADERS.md). Only affects rare PDFs with
  // Type 4 PostScript functions, and only their first render.
  isEvalSupported: false,
  // Fetch only what is rendered — the reader's whole large-book strategy.
  disableAutoFetch: true,
  disableStream: false,
  // 512 KB, not pdf.js's 64 KB default. Every range request is a full,
  // authorised round trip through /api/books/[id]/file, so the cost of a
  // chunk is dominated by the request, not its size. Measured: the ~4 MB a
  // large scanned book needs before its first page took 64 requests / 4.2 s
  // at 64 KB and 8 requests / 0.5 s at 512 KB — and 64 KB tripped the
  // reader's own 30/min rate limit before page one. 1 MB was marginally
  // faster but doubles what a reader on a poor link waits for before
  // anything appears.
  rangeChunkSize: 512 * 1024,
} as const;
