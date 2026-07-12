import { describe, it, expect } from "vitest";
import { validateMimeType, detectMimeType, isPlausibleTextFile } from "./mime-validation";

/** Build an ArrayBuffer that starts with `prefix` bytes then zero-padding. */
function buf(prefix: number[], length = 32): ArrayBuffer {
  const arr = new Uint8Array(length);
  arr.set(prefix, 0);
  return arr.buffer;
}

const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// RIFF....WEBP — WEBP marker sits at offset 8
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
// AVIF: `ftyp` box at offset 4
const AVIF = [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70];

describe("detectMimeType", () => {
  it("detects each supported image and PDF from its magic bytes", () => {
    expect(detectMimeType(buf(PDF))).toBe("application/pdf");
    expect(detectMimeType(buf(JPEG))).toBe("image/jpeg");
    expect(detectMimeType(buf(PNG))).toBe("image/png");
    expect(detectMimeType(buf(WEBP))).toBe("image/webp");
    expect(detectMimeType(buf(AVIF))).toBe("image/avif");
  });

  it("returns null for unrecognised or too-short content", () => {
    expect(detectMimeType(buf([0x00, 0x01, 0x02]))).toBeNull(); // unknown
    expect(detectMimeType(buf([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // ZIP/OOXML — ambiguous
    expect(detectMimeType(new Uint8Array(4).buffer)).toBeNull(); // < 12 bytes
  });

  it("ignores the declared extension — a WebP is detected as WebP", () => {
    // This is the bug the upload route relies on: a .jpg that is really a WebP.
    expect(detectMimeType(buf(WEBP))).toBe("image/webp");
    expect(detectMimeType(buf(WEBP))).not.toBe("image/jpeg");
  });
});

describe("validateMimeType", () => {
  it("passes when content matches the declared type", () => {
    expect(validateMimeType(buf(JPEG), "image/jpeg")).toBe(true);
    expect(validateMimeType(buf(PDF), "application/pdf")).toBe(true);
  });

  it("fails when content does not match the declared type", () => {
    expect(validateMimeType(buf(WEBP), "image/jpeg")).toBe(false);
    expect(validateMimeType(buf(PNG), "application/pdf")).toBe(false);
  });

  it("rejects a type outside the allow-list", () => {
    expect(validateMimeType(buf(JPEG), "image/gif")).toBe(false);
  });
});

describe("isPlausibleTextFile", () => {
  it("accepts ordinary CSV text", () => {
    const csv = new TextEncoder().encode("title,author\nHello,World\n");
    expect(isPlausibleTextFile(csv.buffer)).toBe(true);
  });

  it("rejects a binary disguised as text", () => {
    expect(isPlausibleTextFile(buf(PDF))).toBe(false); // %PDF prefix
    expect(isPlausibleTextFile(buf([0x00, 0x01]))).toBe(false); // NUL byte
  });
});
