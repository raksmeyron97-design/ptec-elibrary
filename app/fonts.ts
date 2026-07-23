// app/fonts.ts
// ──────────────────────────────────────────────────────────────────
// Web fonts (self-hosted via next/font/google)
//
//   Inter        → Latin sans body (variable file: one .woff2 covers 400–700)
//   Hanuman      → Khmer body + headings (static: Khmer fonts aren't variable)
//   Crimson Pro  → Latin serif display (variable file)
//   Angkor       → Khmer display face (font-title — only used on post pages,
//                  so it is NOT preloaded on every route)
//   Koulen       → Khmer DISPLAY face for the homepage hero headline only
//                  (font-khmer-display — likewise not preloaded)
//
// next/font handles the rest of the loading strategy for us:
// font-display: swap, per-subset unicode-range, size-adjusted fallback
// metrics (CLS-safe), and immutable /_next/static caching.
// ──────────────────────────────────────────────────────────────────
import { Angkor, Inter, Hanuman, Crimson_Pro, Koulen } from "next/font/google";

export const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-var-serif",
});

export const angkor = Angkor({
  weight: "400",
  subsets: ["khmer", "latin"],
  display: "swap",
  variable: "--font-var-angkor",
  preload: false,
});

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-var-sans",
});

// Khmer display face for the hero headline. SIL Open Font License 1.1
// (Danh Hong / Cambodia's Ministry of Posts & Telecom, published on Google
// Fonts) — the same face the PMB Cambodia reference site loads for its own
// large Khmer headings.
//
//   • `subsets: ["khmer"]` gates PRELOADING, not @font-face emission —
//     the build still declares Koulen's Latin face (4.8 KB) alongside the
//     Khmer one (11.6 KB). Only the Khmer file is ever fetched here,
//     because the headline is pure Khmer and `--font-khmer-display` lists
//     Crimson Pro ahead of Koulen for Latin. See app/globals.css.
//   • `preload: false` — the font variable is declared on <html> for every
//     route, but exactly one element on one route uses it, and the class
//     is not even in the English DOM. A preload link would download it on
//     every English page for nothing. Without the link the browser still
//     fetches it the moment it lays out the headline on /km.
//   • ONE weight (400) exists. See the `font-normal` on the headline —
//     `font-bold` would make the browser smear a synthetic bold over an
//     already-heavy display face.
export const koulen = Koulen({
  weight: "400",
  subsets: ["khmer"],
  display: "swap",
  variable: "--font-var-koulen",
  preload: false,
});

export const hanuman = Hanuman({
  weight: ["400", "700"],
  subsets: ["khmer"],
  display: "swap",
  variable: "--font-var-hanuman",
});
