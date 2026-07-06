// app/fonts.ts
// ──────────────────────────────────────────────────────────────────
// Web fonts (self-hosted via next/font/google)
//
//   Inter        → Latin sans body (variable file: one .woff2 covers 400–700)
//   Hanuman      → Khmer body + headings (static: Khmer fonts aren't variable)
//   Crimson Pro  → Latin serif display (variable file)
//   Angkor       → Khmer display face (font-title — only used on post pages,
//                  so it is NOT preloaded on every route)
//
// next/font handles the rest of the loading strategy for us:
// font-display: swap, per-subset unicode-range, size-adjusted fallback
// metrics (CLS-safe), and immutable /_next/static caching.
// ──────────────────────────────────────────────────────────────────
import { Angkor, Inter, Hanuman, Crimson_Pro } from "next/font/google";

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

export const hanuman = Hanuman({
  weight: ["400", "700"],
  subsets: ["khmer"],
  display: "swap",
  variable: "--font-var-hanuman",
});
