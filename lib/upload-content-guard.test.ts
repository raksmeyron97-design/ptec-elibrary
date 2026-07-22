import { describe, it, expect } from "vitest";
import {
  guardUploadContent,
  MAX_IMAGE_UPLOAD_BYTES,
} from "@/lib/upload-content-guard";

/** Build an ArrayBuffer that starts with `head` bytes, padded to `len`. */
function buf(head: number[], len = 32): ArrayBuffer {
  const arr = new Uint8Array(Math.max(len, head.length));
  arr.set(head, 0);
  return arr.buffer;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
// RIFF....WEBP — WEBP marker sits at offset 8
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
// ....ftyp — ftyp box at offset 4
const AVIF = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const SVG = [...Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\">")];
const HTML = [...Buffer.from("<!DOCTYPE html><script>alert(1)</script>")];
const EXE = [0x4d, 0x5a, 0x90, 0x00]; // MZ

describe("guardUploadContent", () => {
  it("accepts real raster images and returns the sniffed type", () => {
    expect(guardUploadContent(buf(PNG), "team")).toEqual({ ok: true, effectiveType: "image/png" });
    expect(guardUploadContent(buf(JPEG), "posts")).toEqual({ ok: true, effectiveType: "image/jpeg" });
    expect(guardUploadContent(buf(WEBP), "announcements")).toEqual({ ok: true, effectiveType: "image/webp" });
    expect(guardUploadContent(buf(AVIF), "avatars")).toEqual({ ok: true, effectiveType: "image/avif" });
  });

  it("rejects a script-capable SVG regardless of folder", () => {
    const r = guardUploadContent(buf(SVG), "posts");
    expect(r.ok).toBe(false);
  });

  it("rejects an HTML file disguised as an image", () => {
    const r = guardUploadContent(buf(HTML), "team");
    expect(r.ok).toBe(false);
  });

  it("rejects a renamed executable", () => {
    const r = guardUploadContent(buf(EXE), "books");
    expect(r.ok).toBe(false);
  });

  it("allows PDFs only in folders that expect them", () => {
    expect(guardUploadContent(buf(PDF), "research")).toEqual({ ok: true, effectiveType: "application/pdf" });
    expect(guardUploadContent(buf(PDF), "books")).toEqual({ ok: true, effectiveType: "application/pdf" });
    // A PDF into an image-only folder is rejected.
    expect(guardUploadContent(buf(PDF), "team").ok).toBe(false);
    expect(guardUploadContent(buf(PDF), "avatars").ok).toBe(false);
  });

  it("rejects empty and oversized files", () => {
    expect(guardUploadContent(new ArrayBuffer(0), "team").ok).toBe(false);
    const huge = new ArrayBuffer(MAX_IMAGE_UPLOAD_BYTES + 1);
    new Uint8Array(huge).set(PNG, 0); // valid header, but over the size cap
    expect(guardUploadContent(huge, "team").ok).toBe(false);
  });
});
