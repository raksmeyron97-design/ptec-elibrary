// app/fonts.ts
// ──────────────────────────────────────────────────────────────────
// Web fonts (self-hosted via next/font/google)
//
//   Playfair Display  → Latin serif headings
//   Inter             → Latin sans body
//   Noto Serif Khmer  → Khmer serif headings
//   Angkor            → Khmer display face
//   Battambang        → Khmer + Latin body (fallback/running text)
// ──────────────────────────────────────────────────────────────────
import { Angkor, Battambang, Playfair_Display, Inter, Noto_Serif_Khmer } from "next/font/google";

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

export const playfairDisplay = Playfair_Display({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-var-serif",
});

export const inter = Inter({
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