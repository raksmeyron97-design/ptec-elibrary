// Everything about how the app LOOKS while it is starting up, in one place.
//
// The launch surface spans four systems that must agree on a single colour or
// the user sees a flash between each hand-off:
//
//   Android splash   → manifest background_color   (app/manifest.ts)
//   iOS splash       → apple-touch-startup-image   (IOS_LAUNCH_IMAGES below)
//   status bar       → manifest theme_color + <meta name="theme-color">
//   first app paint  → the boot screen + .hero-ink (components/pwa/…)
//
// Before this file existed the manifest said #ffffff while the app painted
// #060B1A, so every cold launch went white → near-black. Change PWA_INK and all
// four move together.

/**
 * The startup background, light theme — `--ptec-parchment` from
 * app/globals.css. It is what the Android splash paints and what the PTEC
 * startup screen paints, so the two are the same surface.
 *
 * Parchment, not a green: PTEC's palette is navy + gold + parchment and has no
 * green token. Inventing one to match a reference screenshot would put a colour
 * on the launch surface that appears nowhere else in the product.
 */
export const PWA_SPLASH = "#FAF8F2";

/** The same surface for readers on a dark theme — `--ptec-bg-app` dark. The
 *  startup screen switches on the `.dark` class that THEME_INIT_SCRIPT sets
 *  before first paint, so a dark-mode reader never gets a bright flash. */
export const PWA_SPLASH_DARK = "#0E1220";

/**
 * The status bar colour, for the manifest and the `theme-color` meta.
 *
 * Deliberately NOT the splash background: THEME_INIT_SCRIPT re-points the meta
 * tag to this exact value once the stored theme is known, so matching it here
 * means the status bar is one colour from the platform splash all the way
 * through the app. Setting it to the splash background instead produced a
 * parchment-to-navy status bar shift a moment after launch.
 */
export const PWA_THEME_COLOR = "#172554";

/** PTEC ink — `.hero-ink`. Still the colour the homepage hero paints, and what
 *  the maskable icons and iOS launch images are plated with. */
export const PWA_INK = "#060B1A";

/**
 * iOS `apple-touch-startup-image` set.
 *
 * iOS gives an installed PWA no generated splash screen at all: without a link
 * whose media query matches the device EXACTLY, iPhone shows a blank screen
 * (black in dark mode) for the entire cold launch. That was the single worst
 * startup symptom on iOS and it is pure configuration.
 *
 * `w`/`h` are CSS px in portrait; the PNG behind each entry is w*r by h*r.
 * Keep in sync with IOS_DEVICES in scripts/generate-pwa-assets.mjs — the
 * script writes the files this list points at, and lib/pwa/launch.test.ts
 * fails if the two drift.
 */
export const IOS_LAUNCH_IMAGES: readonly {
  name: string;
  w: number;
  h: number;
  r: number;
  landscape?: boolean;
}[] = [
  { name: "iphone-430x932", w: 430, h: 932, r: 3 },
  { name: "iphone-402x874", w: 402, h: 874, r: 3 },
  { name: "iphone-440x956", w: 440, h: 956, r: 3 },
  { name: "iphone-393x852", w: 393, h: 852, r: 3 },
  { name: "iphone-428x926", w: 428, h: 926, r: 3 },
  { name: "iphone-390x844", w: 390, h: 844, r: 3 },
  { name: "iphone-375x812", w: 375, h: 812, r: 3 },
  { name: "iphone-414x896-3x", w: 414, h: 896, r: 3 },
  { name: "iphone-414x896-2x", w: 414, h: 896, r: 2 },
  { name: "iphone-375x667", w: 375, h: 667, r: 2 },
  { name: "iphone-414x736", w: 414, h: 736, r: 3 },
  { name: "ipad-1024x1366", w: 1024, h: 1366, r: 2, landscape: true },
  { name: "ipad-834x1194", w: 834, h: 1194, r: 2, landscape: true },
  { name: "ipad-820x1180", w: 820, h: 1180, r: 2, landscape: true },
  { name: "ipad-810x1080", w: 810, h: 1080, r: 2, landscape: true },
  { name: "ipad-744x1133", w: 744, h: 1133, r: 2, landscape: true },
];

/** The `<link rel="apple-touch-startup-image">` props, flattened to one entry
 *  per orientation. iOS matches on device-width/height in CSS px, so portrait
 *  and landscape swap the two values rather than using different images. */
export function iosLaunchLinks(): { href: string; media: string }[] {
  return IOS_LAUNCH_IMAGES.flatMap((d) => {
    const orientations: ("portrait" | "landscape")[] = d.landscape
      ? ["portrait", "landscape"]
      : ["portrait"];
    return orientations.map((orientation) => ({
      href: `/pwa/splash/${d.name}-${orientation}.png`,
      media:
        `(device-width: ${orientation === "portrait" ? d.w : d.h}px) and ` +
        `(device-height: ${orientation === "portrait" ? d.h : d.w}px) and ` +
        `(-webkit-device-pixel-ratio: ${d.r}) and ` +
        `(orientation: ${orientation})`,
    }));
  });
}
