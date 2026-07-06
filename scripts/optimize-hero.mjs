// scripts/optimize-hero.mjs
// Generates responsive AVIF/WebP/JPEG variants of the homepage hero photo,
// and records a manifest so CI can detect stale variants.
//
//   node scripts/optimize-hero.mjs           regenerate variants + manifest
//   node scripts/optimize-hero.mjs --check   CI mode: verify variants match
//                                            the current source image (no writes)
//
// WHY THIS EXISTS: /hero/* is served with
// `Cache-Control: public, max-age=31536000, immutable` (next.config.ts).
// If public/ptec-library.jpg changes but the generated files keep the same
// names, returning visitors would see the old photo for up to a year.
// The --check mode fails CI whenever the source hash in public/hero/manifest.json
// no longer matches the actual source file — forcing a regeneration (and a
// deliberate decision about renaming) before anything ships.
//
// MAINTENANCE RULE: if the hero photo meaningfully changes, don't just rerun
// this script — also bump OUTPUT_BASENAME below (e.g. ptec-library-v2) and
// update the <picture> srcsets + preload in app/(public)/home/page.tsx, so
// immutable-cached clients fetch the new URLs.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve("public/ptec-library.jpg");
const OUT_DIR = path.resolve("public/hero");
const MANIFEST = path.join(OUT_DIR, "manifest.json");
const OUTPUT_BASENAME = "ptec-library";

// Source is 1440×959 — never upscale, so 1440 is the largest variant.
const WIDTHS = [640, 960, 1440];

const FORMATS = [
  { ext: "avif", options: { quality: 50, effort: 6 } },
  { ext: "webp", options: { quality: 68 } },
];

function expectedOutputs() {
  const outs = [];
  for (const width of WIDTHS) {
    for (const { ext } of FORMATS) {
      outs.push({ file: `${OUTPUT_BASENAME}-${width}.${ext}`, width, format: ext });
    }
  }
  // Single JPEG fallback for browsers without AVIF/WebP support.
  outs.push({ file: `${OUTPUT_BASENAME}-960.jpg`, width: 960, format: "jpeg" });
  return outs;
}

async function sha256(file) {
  const buf = await readFile(file);
  return `sha256-${createHash("sha256").update(buf).digest("hex")}`;
}

async function generate() {
  await mkdir(OUT_DIR, { recursive: true });
  const meta = await sharp(SRC).metadata();
  console.log(`source: ${meta.width}×${meta.height}`);

  const outputs = [];
  for (const width of WIDTHS) {
    const base = sharp(SRC).resize({ width, withoutEnlargement: true });
    for (const { ext, options } of FORMATS) {
      const file = `${OUTPUT_BASENAME}-${width}.${ext}`;
      const info = await base.clone().toFormat(ext, options).toFile(path.join(OUT_DIR, file));
      outputs.push({ path: `public/hero/${file}`, width, format: ext, bytes: info.size });
      console.log(`${file}  ${(info.size / 1024).toFixed(0)} KB`);
    }
  }

  const jpegFile = `${OUTPUT_BASENAME}-960.jpg`;
  const info = await sharp(SRC)
    .resize({ width: 960 })
    .jpeg({ quality: 72, progressive: true, mozjpeg: true })
    .toFile(path.join(OUT_DIR, jpegFile));
  outputs.push({ path: `public/hero/${jpegFile}`, width: 960, format: "jpeg", bytes: info.size });
  console.log(`${jpegFile}  ${(info.size / 1024).toFixed(0)} KB`);

  const manifest = {
    source: "public/ptec-library.jpg",
    sourceHash: await sha256(SRC),
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    generatedAt: new Date().toISOString(),
    outputs,
  };
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest.json written (${manifest.sourceHash.slice(0, 24)}…)`);
}

async function check() {
  const problems = [];

  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    problems.push(`missing or unreadable ${path.relative(process.cwd(), MANIFEST)}`);
  }

  if (manifest) {
    const actualHash = await sha256(SRC).catch(() => null);
    if (!actualHash) {
      problems.push(`source image not found: ${path.relative(process.cwd(), SRC)}`);
    } else if (manifest.sourceHash !== actualHash) {
      problems.push(
        `public/ptec-library.jpg changed since hero variants were generated\n` +
          `    manifest: ${manifest.sourceHash}\n` +
          `    actual:   ${actualHash}`
      );
    }
  }

  for (const { file } of expectedOutputs()) {
    const full = path.join(OUT_DIR, file);
    const st = await stat(full).catch(() => null);
    if (!st || st.size === 0) problems.push(`missing hero variant: public/hero/${file}`);
  }

  if (problems.length > 0) {
    console.error("✖ Hero image cache check FAILED:\n");
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      "\n  /hero/* ships with a 1-year immutable Cache-Control header, so stale" +
        "\n  variants would be served to returning visitors for up to a year." +
        "\n" +
        "\n  Fix: run `npm run optimize:hero` and commit public/hero/." +
        "\n  If the photo is visually different, ALSO rename OUTPUT_BASENAME in" +
        "\n  scripts/optimize-hero.mjs and update the srcsets + preload in" +
        "\n  app/(public)/home/page.tsx so immutable-cached clients see the change."
    );
    process.exit(1);
  }
  console.log("✓ hero variants match public/ptec-library.jpg (manifest + all files present)");
}

const mode = process.argv.includes("--check") ? check : generate;
mode().catch((e) => {
  console.error(e);
  process.exit(1);
});
