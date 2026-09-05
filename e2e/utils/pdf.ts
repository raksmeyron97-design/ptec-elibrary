/**
 * A real, multi-page PDF — built here rather than committed as a binary fixture
 * so the offline specs assert against bytes pdf.js actually parses and renders,
 * not a placeholder blob.
 *
 * The xref offsets are computed from the assembled body: a PDF with wrong
 * offsets is exactly the kind of "file" that would let an offline test pass
 * while a real reader showed an error.
 */
export function makeTestPdf(pageCount = 3, label = "PTEC offline reading test"): Buffer {
  // ids: 1 catalog, 2 page tree, 3 font, then (page, contents) pairs from 4.
  const pageId = (i: number) => 4 + i * 2;
  const contentId = (i: number) => 5 + i * 2;
  const pages = Array.from({ length: pageCount }, (_, i) => i);

  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  for (const i of pages) {
    const stream = `BT /F1 14 Tf 20 160 Td (${label} — page ${i + 1}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents ${contentId(i)} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
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
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;

  return Buffer.from(
    `${body}${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
    "latin1",
  );
}

/**
 * A LARGE, page-heavy PDF for the performance specs — the shape of a scanned
 * textbook: every page carries an uncompressed grayscale image XObject of
 * `bytesPerPage` bytes drawn edge to edge, plus one line of real text (so
 * search has something to find and the text layer is not empty).
 *
 * `pages × bytesPerPage` sets the size: 500 × 48 KB ≈ 24 MB, 200 × 512 KB
 * ≈ 100 MB. The xref offsets are computed from the assembled body, so pdf.js
 * parses it without repair (verified: no "indexing all objects" warning).
 *
 * LAYOUT IS A PARAMETER, because it changes what opening the document costs
 * over a network. pdf.js validates the page count at load
 * (`PDFDocument.checkLastPage` → `getPage(numPages - 1)`), and `getPageDict`
 * on a FLAT page tree issues `xref.fetchAsync` for every kid — so every page
 * DICTIONARY is fetched before the first page paints, whatever
 * `disableAutoFetch` says.
 *
 *   "clustered"   — all page dictionaries together, then the content streams
 *                   and images. What a linearized or optimized PDF looks like
 *                   (and what most producers emit). The page dictionaries
 *                   occupy a few KB, so that walk costs one or two chunks.
 *   "interleaved" — page dict, content, image, repeated. What a naive
 *                   page-at-a-time writer emits. Each page dictionary lands in
 *                   its own 512 KB chunk, so the load-time walk touches the
 *                   WHOLE file however the reader is configured.
 *
 * Defaults to "clustered": it is the common case, and it is the layout in
 * which the reader's own fetching policy is what is being measured.
 */
export function makeLargeTestPdf(opts: {
  pages: number;
  bytesPerPage: number;
  label?: string;
  layout?: "clustered" | "interleaved";
}): Buffer {
  const { pages, bytesPerPage, layout = "clustered" } = opts;
  const label = opts.label ?? "PTEC large PDF";
  // Square-ish gray image whose byte count is bytesPerPage.
  const side = Math.max(8, Math.floor(Math.sqrt(bytesPerPage)));
  const imgW = side;
  const imgH = Math.max(1, Math.floor(bytesPerPage / side));
  const imageBytes = imgW * imgH;
  // A gradient with a per-page phase, so pages are visibly different and the
  // data is not all one byte (which would compress away in any real pipeline
  // and would not exercise the decoder).
  const makeImage = (p: number) => {
    const buf = Buffer.allocUnsafe(imageBytes);
    for (let y = 0; y < imgH; y++) {
      const row = y * imgW;
      for (let x = 0; x < imgW; x++) buf[row + x] = (x + y + p * 7) & 0xff;
    }
    return buf;
  };

  // Object ids: 1 catalog, 2 pages, 3 font, then per page: dict, content, image.
  const pageId = (i: number) => 4 + i * 3;
  const contentId = (i: number) => 5 + i * 3;
  const imageId = (i: number) => 6 + i * 3;
  const kids = Array.from({ length: pages }, (_, i) => `${pageId(i)} 0 R`).join(" ");

  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (s: string | Buffer) => {
    const b = typeof s === "string" ? Buffer.from(s, "latin1") : s;
    parts.push(b);
    length += b.length;
  };
  const obj = (id: number, body: string | Buffer[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    if (typeof body === "string") push(body);
    else for (const b of body) push(b);
    push(`\nendobj\n`);
  };
  const pageDict = (i: number) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId(i)} 0 R ` +
    `/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${imageId(i)} 0 R >> >> >>`;
  const contentStream = (i: number) => {
    const text = `${label} — page ${i + 1}`.replace(/[()\\]/g, "");
    return `q 595 0 0 842 0 0 cm /Im1 Do Q\nBT /F1 18 Tf 1 g 40 780 Td (${text}) Tj ET`;
  };
  const emitContent = (i: number) => {
    const stream = contentStream(i);
    obj(contentId(i), `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    obj(imageId(i), [
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${imageBytes} >>\nstream\n`,
        "latin1",
      ),
      makeImage(i),
      Buffer.from(`\nendstream`, "latin1"),
    ]);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  obj(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  if (layout === "clustered") {
    for (let i = 0; i < pages; i++) obj(pageId(i), pageDict(i));
    for (let i = 0; i < pages; i++) emitContent(i);
  } else {
    for (let i = 0; i < pages; i++) {
      obj(pageId(i), pageDict(i));
      emitContent(i);
    }
  }
  const count = 3 + pages * 3 + 1;
  const xrefStart = length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  push(`${xref}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return Buffer.concat(parts, length);
}
