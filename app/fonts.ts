// app/fonts.ts
// ──────────────────────────────────────────────────────────────────
// Web fonts (self-hosted via next/font/google)
//
//   Inter    → Latin sans body
//   Hanuman  → Khmer body + headings (also used as Latin fallback)
//   Angkor   → Khmer display face (headings via font-title)
// ──────────────────────────────────────────────────────────────────
import { Angkor, Inter, Hanuman, Crimson_Pro } from "next/font/google";

export const crimsonPro = Crimson_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-var-serif",
});

export const angkor = Angkor({
  weight: "400",
  subsets: ["khmer", "latin"],
  display: "swap",
  variable: "--font-var-angkor",
});

export const inter = Inter({
  weight: ["400", "500", "600", "700"],
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
