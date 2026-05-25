// app/fonts.ts
// ──────────────────────────────────────────────────────────────────
// Khmer web fonts (self-hosted via next/font/google — no layout shift,
// no external network request at runtime).
//
//   Angkor      → titles / headings   (decorative Khmer display face)
//   Battambang  → body / running text (readable Khmer + Latin face)
//
// Both support Khmer + Latin, so they work for mixed-script content.
// ──────────────────────────────────────────────────────────────────
import { Angkor, Battambang } from "next/font/google";

export const angkor = Angkor({
  weight: "400",                       // Angkor ships a single weight
  subsets: ["khmer", "latin"],
  display: "swap",
  variable: "--font-angkor",
});

export const battambang = Battambang({
  weight: ["400", "700"],              // regular + bold for body text
  subsets: ["khmer", "latin"],
  display: "swap",
  variable: "--font-battambang",
});