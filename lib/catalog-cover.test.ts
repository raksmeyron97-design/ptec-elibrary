// lib/catalog-cover.test.ts
// Catalog cover pipeline: magic-byte sniffing, filename generation, source
// derivation + the delete-ownership guard, form-intent parsing, and the full
// sharp validation path (decode, min dimensions, WebP re-encode).

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sharp from "sharp";
import { sniffImageType, CATALOG_COVER_FOLDER, COVER_MAX_BYTES } from "@/lib/catalog-cover-shared";
import {
  buildCatalogCoverFilename,
  coverSourceFromUrl,
  isCatalogStorageCover,
  validateExternalCoverUrl,
  parseCoverInput,
  processCatalogCover,
} from "@/lib/catalog-cover";

beforeAll(() => {
  vi.stubEnv("ZIMA_API_URL", "https://api.storage-ptec.online");
});
afterAll(() => vi.unstubAllEnvs());

// ── sniffImageType ────────────────────────────────────────────────────────────

const JPEG_HEAD = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG_HEAD = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_HEAD = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("sniffImageType", () => {
  it("recognises JPEG / PNG / WebP signatures", () => {
    expect(sniffImageType(JPEG_HEAD)).toBe("image/jpeg");
    expect(sniffImageType(PNG_HEAD)).toBe("image/png");
    expect(sniffImageType(WEBP_HEAD)).toBe("image/webp");
  });

  it("rejects non-image and disguised content regardless of extension claims", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    const gif = new TextEncoder().encode("GIF89a......");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(sniffImageType(html)).toBeNull();
    expect(sniffImageType(gif)).toBeNull();       // GIF deliberately unsupported
    expect(sniffImageType(svg)).toBeNull();       // SVG deliberately unsupported
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(new Uint8Array(4))).toBeNull(); // too short to identify
  });

  it("does not accept a RIFF container that is not WebP (e.g. WAV)", () => {
    const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

// ── buildCatalogCoverFilename ─────────────────────────────────────────────────

describe("buildCatalogCoverFilename", () => {
  it("slugifies the title and appends a random suffix + .webp", () => {
    const name = buildCatalogCoverFilename("International Humanitarian Law", "a83f71c2");
    expect(name).toBe("international-humanitarian-law-a83f71c2.webp");
  });

  it("never contains path separators or the original extension", () => {
    const name = buildCatalogCoverFilename("../../etc/passwd <script>.php.jpg");
    expect(name).not.toMatch(/[/\\]/);
    expect(name).toMatch(/\.webp$/);
    expect(name).not.toContain("..");
  });

  it("falls back to 'cover' for titles that slugify to nothing", () => {
    expect(buildCatalogCoverFilename("!!!", "beef1234")).toBe("cover-beef1234.webp");
  });

  it("generates a fresh random suffix per call", () => {
    expect(buildCatalogCoverFilename("Same Title")).not.toBe(buildCatalogCoverFilename("Same Title"));
  });
});

// ── source derivation + delete guard ─────────────────────────────────────────

describe("coverSourceFromUrl / isCatalogStorageCover", () => {
  const OURS = `https://storage-ptec.online/files/${CATALOG_COVER_FOLDER}/law-a1b2c3d4.webp`;

  it("null/empty → generated", () => {
    expect(coverSourceFromUrl(null)).toBe("generated");
    expect(coverSourceFromUrl(undefined)).toBe("generated");
    expect(coverSourceFromUrl("")).toBe("generated");
  });

  it("catalog-covers Zima URL → storage (and owned)", () => {
    expect(coverSourceFromUrl(OURS)).toBe("storage");
    expect(isCatalogStorageCover(OURS)).toBe(true);
  });

  it("any other URL → external and NEVER owned (delete guard)", () => {
    const foreign = [
      "https://example.com/cover.jpg",
      "https://storage-ptec.online/files/books/ebook-cover.webp",   // Zima, wrong folder
      "https://storage-ptec.online/files/posts/hero.webp",          // Zima, wrong folder
      `https://evil.example.com/files/${CATALOG_COVER_FOLDER}/x.webp`, // right path, wrong host
      "not a url",
    ];
    for (const url of foreign) {
      expect(coverSourceFromUrl(url)).toBe("external");
      expect(isCatalogStorageCover(url)).toBe(false);
    }
  });
});

// ── external URL validation ───────────────────────────────────────────────────

describe("validateExternalCoverUrl", () => {
  it("accepts https URLs", () => {
    expect(validateExternalCoverUrl("https://covers.example.org/a.jpg")).toBe(
      "https://covers.example.org/a.jpg",
    );
  });
  it("rejects http, non-URLs and oversized strings", () => {
    expect(validateExternalCoverUrl("http://covers.example.org/a.jpg")).toBeNull();
    expect(validateExternalCoverUrl("javascript:alert(1)")).toBeNull();
    expect(validateExternalCoverUrl("ftp://x/a.jpg")).toBeNull();
    expect(validateExternalCoverUrl("no scheme at all")).toBeNull();
    expect(validateExternalCoverUrl("https://x.example/" + "a".repeat(2100))).toBeNull();
  });
});

// ── parseCoverInput ───────────────────────────────────────────────────────────

function fd(entries: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseCoverInput", () => {
  it("legacy contract (no cover_mode): blank keeps, __remove__ clears, https sets", () => {
    expect(parseCoverInput(fd({}))).toEqual({ mode: "keep" });
    expect(parseCoverInput(fd({ cover_url: "  " }))).toEqual({ mode: "keep" });
    expect(parseCoverInput(fd({ cover_url: "__remove__" }))).toEqual({ mode: "generated" });
    expect(parseCoverInput(fd({ cover_url: "https://x.example/a.jpg" }))).toEqual({
      mode: "external",
      url: "https://x.example/a.jpg",
    });
    expect(parseCoverInput(fd({ cover_url: "http://insecure.example/a.jpg" }))).toEqual({ mode: "keep" });
  });

  it("rejects unknown modes", () => {
    expect(parseCoverInput(fd({ cover_mode: "yolo" })).mode).toBe("invalid");
  });

  it("keep / generated pass through", () => {
    expect(parseCoverInput(fd({ cover_mode: "keep" }))).toEqual({ mode: "keep" });
    expect(parseCoverInput(fd({ cover_mode: "generated" }))).toEqual({ mode: "generated" });
  });

  it("external requires a valid https URL", () => {
    expect(parseCoverInput(fd({ cover_mode: "external" })).mode).toBe("invalid");
    expect(parseCoverInput(fd({ cover_mode: "external", cover_url: "notaurl" })).mode).toBe("invalid");
    expect(parseCoverInput(fd({ cover_mode: "external", cover_url: "https://x.example/a.png" }))).toEqual({
      mode: "external",
      url: "https://x.example/a.png",
    });
  });

  it("upload requires a non-empty file", () => {
    expect(parseCoverInput(fd({ cover_mode: "upload" })).mode).toBe("invalid");
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    expect(parseCoverInput(fd({ cover_mode: "upload", cover_file: empty })).mode).toBe("invalid");
    const file = new File([Uint8Array.from([1, 2, 3])], "c.jpg", { type: "image/jpeg" });
    const parsed = parseCoverInput(fd({ cover_mode: "upload", cover_file: file }));
    expect(parsed.mode).toBe("upload");
  });
});

// ── processCatalogCover (sharp path) ─────────────────────────────────────────

async function makeImage(width: number, height: number, format: "jpeg" | "png" | "webp") {
  const img = sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 40, b: 40 } },
  });
  const buf = await (format === "jpeg" ? img.jpeg() : format === "png" ? img.png() : img.webp()).toBuffer();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("processCatalogCover", () => {
  it("accepts a valid JPEG cover and re-encodes to WebP with dimensions", async () => {
    const res = await processCatalogCover(await makeImage(600, 900, "jpeg"), "cover.jpg");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cover.contentType).toBe("image/webp");
      expect(res.cover.width).toBe(600);
      expect(res.cover.height).toBe(900);
      expect(res.cover.buffer.byteLength).toBeGreaterThan(0);
      expect(sniffImageType(res.cover.buffer)).toBe("image/webp");
    }
  }, 20000);

  it("accepts PNG and WebP sources too", async () => {
    expect((await processCatalogCover(await makeImage(300, 450, "png"), "c.png")).ok).toBe(true);
    expect((await processCatalogCover(await makeImage(300, 450, "webp"), "c.webp")).ok).toBe(true);
  }, 20000);

  it("rejects images below the minimum dimensions", async () => {
    const res = await processCatalogCover(await makeImage(200, 300, "jpeg"), "small.jpg");
    expect(res).toMatchObject({ ok: false, error: { code: "IMAGE_TOO_SMALL" } });
  });

  it("rejects empty files", async () => {
    const res = await processCatalogCover(new ArrayBuffer(0), "zero.jpg");
    expect(res).toMatchObject({ ok: false, error: { code: "INVALID_IMAGE" } });
  });

  it("rejects oversized files before decoding", async () => {
    const big = new Uint8Array(COVER_MAX_BYTES + 1);
    big.set(JPEG_HEAD);
    const res = await processCatalogCover(big.buffer, "huge.jpg");
    expect(res).toMatchObject({ ok: false, error: { code: "FILE_TOO_LARGE" } });
  });

  it("rejects HTML masquerading as an image (magic bytes, not extension)", async () => {
    const html = new TextEncoder().encode("<html><body>not an image</body></html>");
    const res = await processCatalogCover(html.buffer as ArrayBuffer, "cover.jpg");
    expect(res).toMatchObject({ ok: false, error: { code: "INVALID_FILE_TYPE" } });
  });

  it("rejects a corrupt file with a forged JPEG signature", async () => {
    const forged = new Uint8Array(2048);
    forged.set(JPEG_HEAD);
    const res = await processCatalogCover(forged.buffer, "forged.jpg");
    expect(res).toMatchObject({ ok: false, error: { code: "INVALID_IMAGE" } });
  });
});
