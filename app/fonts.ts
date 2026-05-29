// app/fonts.ts
// ──────────────────────────────────────────────────────────────────
// Web fonts (self-hosted via next/font/google)
//
//   Libre Baskerville → Latin serif headings
//   Public Sans       → Latin sans body
//   Noto Serif Khmer  → Khmer serif headings
//   Angkor            → Khmer display face
//   Battambang        → Khmer + Latin body (fallback/running text)
// ──────────────────────────────────────────────────────────────────
import { Angkor, Battambang, Libre_Baskerville, Public_Sans, Noto_Serif_Khmer } from "next/font/google";

export const angkor = Angkor({
  weight: "400",
  subsets: ["khmer", "latin"],
  display: "swap",
  variable: "--font-var-angkor",
});

export const battambang = Battambang({
  weight: ["400", "700"],
  subsets: ["khmer", "latin"],
  display: "swap",
  variable: "--font-var-battambang",
});

export const libreBaskerville = Libre_Baskerville({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-var-serif",
});

export const publicSans = Public_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-var-sans",
});

export const notoSerifKhmer = Noto_Serif_Khmer({
  weight: ["400", "700"],
  subsets: ["khmer"],
  display: "swap",
  variable: "--font-var-khmer-serif",
});