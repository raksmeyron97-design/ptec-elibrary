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
