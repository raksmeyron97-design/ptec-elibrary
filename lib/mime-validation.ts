/**
 * Validate file content against expected MIME types by checking magic bytes.
 * Prevents upload of malicious files disguised with a false content-type header.
 */

// DOCX/XLSX/PPTX are all OOXML — a ZIP container, so they share the same
// leading "PK\x03\x04" signature. Magic bytes alone can't tell them apart
// (that needs unzipping and reading [Content_Types].xml); this still blocks
// anything that isn't a real ZIP-based file pretending to be one, which is
// the actual threat model here (spoofed Content-Type header).
const OOXML_ZIP_SIGNATURE = [{ bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 }];

const SIGNATURES: Record<string, { bytes: number[]; offset: number }[]> = {
  "application/pdf": [{ bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }], // %PDF
  "image/jpeg": [{ bytes: [0xff, 0xd8, 0xff], offset: 0 }],
  "image/png": [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 }],
  "image/webp": [
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF
    { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // WEBP
  ],
  "image/avif": [
    { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // ftyp box
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": OOXML_ZIP_SIGNATURE, // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": OOXML_ZIP_SIGNATURE, // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": OOXML_ZIP_SIGNATURE, // .pptx
};

const ALLOWED_MIMES = new Set(Object.keys(SIGNATURES));

/**
 * Check that the binary content of a file matches its declared MIME type
 * by verifying magic-byte signatures.
 *
 * @returns `true` if the file content matches the declared type
 */
export function validateMimeType(
  buffer: ArrayBuffer,
  declaredType: string
): boolean {
  if (!ALLOWED_MIMES.has(declaredType)) return false;

  const view = new Uint8Array(buffer);
  if (view.length < 12) return false; // too small to contain any valid signature

  const sigs = SIGNATURES[declaredType];
  return sigs.every((sig) =>
    sig.bytes.every((b, i) => view[sig.offset + i] === b)
  );
}

// Reject a file outright if it opens with a known binary/executable/document
// signature while being uploaded as plain text (CSV) — catches the obvious
// "renamed .exe to .csv" case even though CSV itself has no signature of its
// own to positively match against.
const DISALLOWED_TEXT_PREFIXES: number[][] = [
  [0x4d, 0x5a], // MZ — Windows PE/EXE/DLL
  [0x7f, 0x45, 0x4c, 0x46], // ELF — Linux executable
  [0x25, 0x50, 0x44, 0x46], // %PDF
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x50, 0x4b, 0x03, 0x04], // ZIP / OOXML
  [0x1f, 0x8b], // GZIP
];

/**
 * Heuristic "is this plausibly a text/CSV file" check — used where a format
 * has no magic-byte signature to verify against (see `ALLOWED_SUPPLEMENTARY_MIMES`
 * in lib/admin/thesis-file-validation.ts). This is a WEAKER guarantee than
 * `validateMimeType()`: it can't prove the content really is well-formed CSV,
 * only that it isn't an obviously-disguised binary/executable. Rejects any
 * NUL byte (never legitimate in text) and caps how much of the sampled
 * content may be non-printable control characters.
 */
export function isPlausibleTextFile(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer);
  if (view.length === 0) return false;

  for (const sig of DISALLOWED_TEXT_PREFIXES) {
    if (sig.every((b, i) => view[i] === b)) return false;
  }

  const sample = view.subarray(0, Math.min(view.length, 8192));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0x00) return false; // NUL byte — never valid in text
    // Allow common whitespace (tab, LF, CR); count other control chars as suspicious.
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious++;
  }
  return suspicious / sample.length < 0.01;
}
