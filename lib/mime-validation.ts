/**
 * Validate file content against expected MIME types by checking magic bytes.
 * Prevents upload of malicious files disguised with a false content-type header.
 */

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
