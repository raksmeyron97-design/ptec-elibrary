/**
 * A stand-in PDF for LOCAL DEVELOPMENT ONLY.
 *
 * Why this exists: `supabase/seed.sql` gives the seeded book a `book_files`
 * row so the reader surfaces are reachable, but its `file_url` is a bare
 * legacy R2 key (`books/seed/foundations-of-education.pdf`) pointing at an
 * object that exists in no local store. Zima is not running either. So the one
 * seeded readable book answered 500 (and, once the crash was fixed, 404) and
 * the reader could not be opened by hand at all — only the e2e specs, which
 * stub the file route with a generated PDF, ever saw it work.
 *
 * The rules that keep this honest:
 *   • It is impossible in production. `isPlaceholderPdfEnabled()` requires
 *     `NODE_ENV !== "production"`, so `npm run build` / `npm start` never
 *     reach it whatever the storage configuration says.
 *   • It is only ever a LAST resort, after real storage has been asked and
 *     could not answer.
 *   • It says what it is, on every page. Nobody can mistake it for library
 *     content, and a developer who sees it knows the real file is missing
 *     rather than believing the book loaded.
 *   • `DEV_PLACEHOLDER_PDF=off` disables it, for anyone who would rather see
 *     the honest 404 while working on the reader's error states.
 */

/** A4 in PostScript points — the aspect the reader assumes before it has
 *  measured page 1, so the placeholder does not cause a layout shift. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const DEFAULT_PAGES = 8;

export function isPlaceholderPdfEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_PLACEHOLDER_PDF !== "off";
}

/** PDF text strings are latin1 and must escape \ ( ). Anything outside the
 *  printable ASCII range (a Khmer title, say) is dropped rather than rendered
 *  as mojibake by the base-14 Helvetica this document uses. */
function pdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/([\\()])/g, "\\$1")
    .slice(0, 90);
}

/**
 * Build a valid multi-page PDF. Offsets in the cross-reference table are
 * computed from the assembled body — a PDF with wrong offsets is exactly the
 * kind of "file" that would let this look fine here and fail in pdf.js.
 */
export function buildPlaceholderPdf(title: string, pageCount = DEFAULT_PAGES): Buffer {
  const pages = Array.from({ length: Math.max(1, pageCount) }, (_, i) => i);
  const pageId = (i: number) => 4 + i * 2;
  const contentId = (i: number) => 5 + i * 2;
  const safeTitle = pdfText(title) || "Untitled";

  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
  ];

  for (const i of pages) {
    const stream = [
      "BT /F1 20 Tf 60 760 Td (" + safeTitle + ") Tj ET",
      "BT /F1 13 Tf 60 720 Td (Development placeholder - not library content) Tj ET",
      "BT /F1 11 Tf 60 690 Td (The real file is not available in this environment.) Tj ET",
      "BT /F1 11 Tf 60 672 Td (No storage backend holds this book locally.) Tj ET",
      `BT /F1 11 Tf 60 60 Td (Page ${i + 1} of ${pages.length}) Tj ET`,
      // A hairline frame, so page boundaries are obvious while scrolling.
      `0.8 0.8 0.8 RG 1 w 40 40 ${PAGE_WIDTH - 80} ${PAGE_HEIGHT - 80} re S`,
    ].join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Contents ${contentId(i)} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = body.length;
  // Every xref entry is exactly 20 bytes: 10-digit offset, space, 5-digit
  // generation, space, type, space, newline.
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;

  return Buffer.from(
    `${body}${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
    "latin1",
  );
}

/** `bytes=START-END` → inclusive [start, end], clamped, or null. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  // Suffix form: the last N bytes.
  if (!rawStart) {
    const suffix = Math.min(Number(rawEnd), size);
    return suffix > 0 ? { start: size - suffix, end: size - 1 } : null;
  }
  const start = Number(rawStart);
  if (start >= size) return null;
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  return end >= start ? { start, end } : null;
}

/**
 * The placeholder as an HTTP response, honouring `Range` so the reader
 * exercises the same byte-range path it uses against real storage. Returns
 * null when placeholders are not enabled — callers fall through to their
 * ordinary 404.
 */
export function placeholderPdfResponse(opts: {
  title: string;
  rangeHeader: string | null;
  disposition: string;
  /** Names the calling route in the server log. */
  source: string;
}): Response | null {
  if (!isPlaceholderPdfEnabled()) return null;

  const pdf = buildPlaceholderPdf(opts.title);
  console.warn(
    `[${opts.source}] serving a DEVELOPMENT PLACEHOLDER pdf for "${opts.title}" — ` +
      `no storage backend holds this file. Set DEV_PLACEHOLDER_PDF=off for the real 404.`,
  );

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": opts.disposition,
    "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
    "Accept-Ranges": "bytes",
    "X-Ptec-Placeholder": "development",
  });

  const range = parseRange(opts.rangeHeader, pdf.length);
  if (range) {
    const slice = pdf.subarray(range.start, range.end + 1);
    headers.set("Content-Length", String(slice.length));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${pdf.length}`);
    return new Response(new Uint8Array(slice), { status: 206, headers });
  }

  headers.set("Content-Length", String(pdf.length));
  return new Response(new Uint8Array(pdf), { status: 200, headers });
}
