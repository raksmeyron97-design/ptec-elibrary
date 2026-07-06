// scripts/optimize-hero.mjs
// Generates responsive AVIF/WebP/JPEG variants of the homepage hero photo.
// Run whenever public/ptec-library.jpg changes:
//   node scripts/optimize-hero.mjs
//
// Output goes to public/hero/ and is committed to the repo, so no runtime
// image transformation is needed (next.config has images.unoptimized: true).
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve("public/ptec-library.jpg");
const OUT_DIR = path.resolve("public/hero");

// Source is 1440×959 — never upscale, so 1440 is the largest variant.
const WIDTHS = [640, 960, 1440];

const FORMATS = [
  { ext: "avif", options: { quality: 50, effort: 6 } },
  { ext: "webp", options: { quality: 68 } },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const meta = await sharp(SRC).metadata();
  console.log(`source: ${meta.width}×${meta.height}`);

  for (const width of WIDTHS) {
    const base = sharp(SRC).resize({ width, withoutEnlargement: true });
    for (const { ext, options } of FORMATS) {
      const out = path.join(OUT_DIR, `ptec-library-${width}.${ext}`);
      const info = await base.clone().toFormat(ext, options).toFile(out);
      console.log(`${path.basename(out)}  ${(info.size / 1024).toFixed(0)} KB`);
    }
  }

  // Single JPEG fallback for browsers without AVIF/WebP (rare, keep mid-size).
  const jpegOut = path.join(OUT_DIR, "ptec-library-960.jpg");
  const info = await sharp(SRC)
    .resize({ width: 960 })
    .jpeg({ quality: 72, progressive: true, mozjpeg: true })
    .toFile(jpegOut);
  console.log(`${path.basename(jpegOut)}  ${(info.size / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
