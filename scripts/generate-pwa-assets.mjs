// Generates the PWA launch assets that cannot be authored by hand: Android
// maskable icons and the iOS `apple-touch-startup-image` set.
//
// WHY THESE ARE GENERATED, NOT COMMITTED BY HAND
//
//   • Maskable icons have a hard geometric contract: Android composites the
//     icon under a launcher-chosen mask (circle, squircle, teardrop…) and only
//     the central 80%-diameter circle is guaranteed to survive. The source
//     emblem is a full-bleed circle that spans 84.4% of its canvas, so every
//     mask clipped the "PHNOM PENH TEACHER EDUCATION COLLEGE" ring off it.
//     Here the emblem is re-laid-out at MASKABLE_LOGO_RATIO on an opaque
//     plate, which is the only way that contract can be met.
//
//   • iOS gives an installed PWA NO generated splash screen. Without an
//     `apple-touch-startup-image` whose media query matches the device
//     exactly, iPhone shows a blank (black in dark mode) screen for the whole
//     cold launch. One PNG per device geometry is the only mechanism iOS
//     offers, and the media queries must match to the pixel.
//
// Run: node scripts/generate-pwa-assets.mjs
// Verify (CI/prebuild): node scripts/generate-pwa-assets.mjs --check

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..");
const SOURCE_EMBLEM = path.join(ROOT, "public/favicon/web-app-manifest-512x512.png");
const ICON_DIR = path.join(ROOT, "public/favicon");
const SPLASH_DIR = path.join(ROOT, "public/pwa/splash");

/** PTEC ink — `.hero-ink` in app/globals.css, and the first colour the app
 *  actually paints in BOTH themes. Every launch surface uses it so the
 *  platform splash and the app shell are the same colour. */
const INK_RGB = { r: 0x06, g: 0x0b, b: 0x1a, alpha: 1 };

/** Fraction of the icon edge the emblem may occupy on a maskable plate.
 *  0.6 keeps the whole circle inside Android's 80%-diameter safe zone with
 *  room to spare for aggressive teardrop masks. */
const MASKABLE_LOGO_RATIO = 0.6;

/** Fraction of the shortest splash edge used by the emblem. Deliberately
 *  modest: this screen exists to say "PTEC is opening", not to be looked at. */
const SPLASH_LOGO_RATIO = 0.34;

/**
 * Hard ceiling on the emblem's pixel size inside a splash, and the palette
 * these files are quantised to.
 *
 * These exist for a storage reason, not a visual one. @serwist/next precaches
 * everything under public/, and public/ files are appended to the manifest
 * AFTER user manifestTransforms run (@serwist/build applies
 * additionalPrecacheEntriesTransform last), so there is no config hook that can
 * exclude them — an `exclude` regex and a manifestTransform were both tried and
 * both no-ops. The only lever left is making the files small enough that
 * precaching them does not matter: at full size the set was 2.1 MB on top of an
 * 8 MB install.
 *
 * The background is one flat colour and compresses to nothing; essentially the
 * whole file is the emblem, so capping it is what actually moves the number.
 * 384 px still renders crisply — on the largest target (iPad Pro, 2048x2732)
 * the emblem occupies 384 of 2048 px, close to the 0.34 ratio anyway.
 */
const SPLASH_LOGO_MAX_PX = 384;
const SPLASH_PALETTE_COLOURS = 64;

/**
 * iOS launch images. `width`/`height` are CSS px (what the media query must
 * say), `ratio` is devicePixelRatio; the PNG itself is width*ratio wide.
 *
 * iOS matches these EXACTLY — a device whose geometry is missing here falls
 * back to a blank screen, which is the bug this list exists to fix. Devices
 * sharing a geometry (e.g. iPhone 15 Pro Max and 16 Plus) share one entry.
 */
const IOS_DEVICES = [
  { name: "iphone-430x932", width: 430, height: 932, ratio: 3 }, // 15/16 Pro Max, 15/16 Plus
  { name: "iphone-402x874", width: 402, height: 874, ratio: 3 }, // 16 Pro
  { name: "iphone-440x956", width: 440, height: 956, ratio: 3 }, // 16 Pro Max
  { name: "iphone-393x852", width: 393, height: 852, ratio: 3 }, // 14/15/16 Pro, 15/16
  { name: "iphone-428x926", width: 428, height: 926, ratio: 3 }, // 12/13/14 Pro Max, 14 Plus
  { name: "iphone-390x844", width: 390, height: 844, ratio: 3 }, // 12/13/14, 13 Pro
  { name: "iphone-375x812", width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12/13 mini
  { name: "iphone-414x896-3x", width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { name: "iphone-414x896-2x", width: 414, height: 896, ratio: 2 }, // XR, 11
  { name: "iphone-375x667", width: 375, height: 667, ratio: 2 }, // SE 2/3, 8, 7, 6s
  { name: "iphone-414x736", width: 414, height: 736, ratio: 3 }, // 8 Plus, 7 Plus
  { name: "ipad-1024x1366", width: 1024, height: 1366, ratio: 2 }, // Pro 12.9"
  { name: "ipad-834x1194", width: 834, height: 1194, ratio: 2 }, // Pro 11"
  { name: "ipad-820x1180", width: 820, height: 1180, ratio: 2 }, // Air 10.9"
  { name: "ipad-810x1080", width: 810, height: 1080, ratio: 2 }, // 10.2"
  { name: "ipad-744x1133", width: 744, height: 1133, ratio: 2 }, // mini 8.3"
];

/** iPads are used in both orientations in a way phones effectively are not. */
const LANDSCAPE_TOO = (name) => name.startsWith("ipad-");

/** The emblem, resized to `size` px and centred on an opaque ink plate. */
async function inkPlate(canvas, logoPx, { colours } = {}) {
  const logo = await sharp(SOURCE_EMBLEM)
    .resize(logoPx, logoPx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: INK_RGB,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9, palette: true, ...(colours ? { colours, dither: 0 } : {}) })
    .toBuffer();
}

async function buildAssets() {
  const out = new Map();

  // ── Android maskable icons + an opaque apple-touch-icon. ──────────────────
  // The apple-touch-icon must be opaque: iOS discards the alpha channel and
  // composites what is left onto BLACK, so the transparent original rendered
  // as an emblem floating on a black tile on every home screen.
  for (const size of [192, 512]) {
    out.set(
      path.join(ICON_DIR, `icon-maskable-${size}.png`),
      await inkPlate({ width: size, height: size }, Math.round(size * MASKABLE_LOGO_RATIO)),
    );
  }
  out.set(
    path.join(ICON_DIR, "apple-touch-icon.png"),
    // iOS applies its own corner radius, so the emblem can sit larger here
    // than on an Android maskable plate — but not edge-to-edge.
    await inkPlate({ width: 180, height: 180 }, Math.round(180 * 0.78)),
  );

  // ── Emblem for the offline fallback page. ─────────────────────────────────
  // Keeps its alpha: it is rendered on the page background, not on a plate.
  //
  // The boot screen (components/pwa/PTECBootScreen.tsx) deliberately does NOT
  // use this — putting an emblem on the launch critical path cost ~240 ms of
  // FCP however it was delivered. See that file for the measurements.
  out.set(
    path.join(SPLASH_DIR, "boot-emblem.webp"),
    await sharp(SOURCE_EMBLEM)
      .resize(224, 224, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82, effort: 6 })
      .toBuffer(),
  );

  // ── iOS launch images. ────────────────────────────────────────────────────
  for (const device of IOS_DEVICES) {
    const orientations = LANDSCAPE_TOO(device.name)
      ? ["portrait", "landscape"]
      : ["portrait"];
    for (const orientation of orientations) {
      const w = (orientation === "portrait" ? device.width : device.height) * device.ratio;
      const h = (orientation === "portrait" ? device.height : device.width) * device.ratio;
      const logoPx = Math.min(
        Math.round(Math.min(w, h) * SPLASH_LOGO_RATIO),
        SPLASH_LOGO_MAX_PX,
      );
      out.set(
        path.join(SPLASH_DIR, `${device.name}-${orientation}.png`),
        await inkPlate({ width: w, height: h }, logoPx, {
          colours: SPLASH_PALETTE_COLOURS,
        }),
      );
    }
  }

  return out;
}

const digest = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);

async function main() {
  const check = process.argv.includes("--check");
  await fs.mkdir(SPLASH_DIR, { recursive: true });

  const assets = await buildAssets();
  const stale = [];

  for (const [file, buf] of assets) {
    const existing = await fs.readFile(file).catch(() => null);
    if (existing && digest(existing) === digest(buf)) continue;
    if (check) {
      stale.push(path.relative(ROOT, file));
      continue;
    }
    await fs.writeFile(file, buf);
    console.log(`  wrote ${path.relative(ROOT, file)} (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  if (check && stale.length) {
    console.error(
      `✗ PWA assets are stale or missing:\n  ${stale.join("\n  ")}\n` +
        `  Run: node scripts/generate-pwa-assets.mjs`,
    );
    process.exit(1);
  }
  console.log(
    check
      ? `✓ PWA launch assets up to date (${assets.size} files)`
      : `✓ generated ${assets.size} PWA launch assets`,
  );
}

await main();
