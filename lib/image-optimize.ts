/**
 * Server-side image optimization using `sharp`.
 *
 * Compresses and resizes images before they are uploaded to Zima Storage,
 * so every stored image is already small and web-ready — no runtime
 * optimisation (Vercel Image Optimization) needed.
 *
 * Non-image files (PDFs, etc.) pass through untouched.
 */

import sharp from "sharp";

/** MIME types that `sharp` can process. */
const OPTIMIZABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/tiff",
  "image/gif",
]);

interface OptimizeOptions {
  /** Max width in pixels. Height scales proportionally. @default 1200 */
  maxWidth?: number;
  /** Max height in pixels. Width scales proportionally. @default 1200 */
  maxHeight?: number;
  /** WebP quality (1-100). Lower = smaller file. @default 80 */
  quality?: number;
  /** If true, output as AVIF instead of WebP. @default false */
  avif?: boolean;
}

interface OptimizeResult {
  /** The optimized (or original) file bytes. */
  buffer: Uint8Array<ArrayBuffer>;
  /** The MIME type of the output. */
  contentType: string;
  /** Suggested filename (extension may change to .webp). */
  filename: string;
}

/**
 * Optimize an image buffer before upload.
 *
 * - Resizes to fit within `maxWidth × maxHeight` (default 1200×1200).
 * - Converts to WebP (or AVIF) for maximum compression.
 * - Non-image files are returned as-is.
 *
 * @param input  Raw file bytes.
 * @param originalName  Original filename (used to derive the output name).
 * @param mimeType  Declared MIME type of the input.
 * @param opts  Optional overrides for dimensions / quality.
 */
export async function optimizeImage(
  input: ArrayBuffer | Buffer,
  originalName: string,
  mimeType: string,
  opts: OptimizeOptions = {},
): Promise<OptimizeResult> {
  // Pass non-image files through without touching them
  if (!OPTIMIZABLE_TYPES.has(mimeType)) {
    const bytes = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
    return {
      buffer: bytes as Uint8Array<ArrayBuffer>,
      contentType: mimeType,
      filename: originalName,
    };
  }

  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 80,
    avif = false,
  } = opts;

  const inputBuffer = Buffer.isBuffer(input) ? input : Buffer.from(new Uint8Array(input));

  let pipeline = sharp(inputBuffer)
    .rotate() // auto-rotate based on EXIF orientation
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",            // keep aspect ratio, never upscale
      withoutEnlargement: true, // don't upscale small images
    });

  let outputExt: string;
  let outputMime: string;

  if (avif) {
    pipeline = pipeline.avif({ quality, effort: 4 });
    outputExt = ".avif";
    outputMime = "image/avif";
  } else {
    pipeline = pipeline.webp({ quality });
    outputExt = ".webp";
    outputMime = "image/webp";
  }

  const sharpBuffer = await pipeline.toBuffer();

  // Replace the file extension
  const baseName = originalName.replace(/\.[^.]+$/, "");
  const filename = `${baseName}${outputExt}`;

  // Convert Node Buffer → Uint8Array<ArrayBuffer> for File/Blob compatibility
  const buffer = new Uint8Array(sharpBuffer.buffer.slice(sharpBuffer.byteOffset, sharpBuffer.byteOffset + sharpBuffer.byteLength)) as Uint8Array<ArrayBuffer>;

  return { buffer, contentType: outputMime, filename };
}

/**
 * Preset for book covers — slightly smaller, good quality.
 * Max 800px wide, 75 quality WebP ≈ 50-150 KB per cover.
 */
export const BOOK_COVER_OPTS: OptimizeOptions = {
  maxWidth: 800,
  maxHeight: 1200,
  quality: 75,
};

/**
 * Preset for avatar images — small square-ish images.
 * Max 400px, moderate quality ≈ 20-60 KB.
 */
export const AVATAR_OPTS: OptimizeOptions = {
  maxWidth: 400,
  maxHeight: 400,
  quality: 70,
};

/**
 * Preset for post/blog images — larger, higher quality.
 * Max 1400px wide, quality 80 ≈ 100-300 KB.
 */
export const POST_IMAGE_OPTS: OptimizeOptions = {
  maxWidth: 1400,
  maxHeight: 1400,
  quality: 80,
};
