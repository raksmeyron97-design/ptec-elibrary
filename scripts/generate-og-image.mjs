// scripts/generate-og-image.mjs
// Generates Open Graph default image assets (og-default.png & og-default.jpg)
// Title updated from "The Digital Teaching Library" -> "The Digital Library".

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..");
const LOGO_PATH = path.join(ROOT, "public/logo.png");
const PNG_OUT = path.join(ROOT, "public/og-default.png");
const JPG_OUT = path.join(ROOT, "public/og-default.jpg");

async function generateOGImages() {
  const logoBuffer = await fs.readFile(LOGO_PATH);
  const logoBase64 = logoBuffer.toString("base64");

  const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@700&amp;family=Inter:wght@500;700&amp;display=swap');
      .eyebrow {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        font-size: 19px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        fill: #F59E0B;
      }
      .title-line1 {
        font-family: 'Crimson Pro', 'Georgia', serif;
        font-size: 68px;
        font-weight: 700;
        fill: #FFFFFF;
      }
      .title-line2 {
        font-family: 'Crimson Pro', 'Georgia', serif;
        font-size: 68px;
        font-weight: 700;
        fill: #F59E0B;
      }
      .subtitle {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        font-size: 22px;
        font-weight: 500;
        fill: #93C5FD;
      }
    </style>

    <!-- Background Gradients -->
    <radialGradient id="cyanGlow" cx="85%" cy="15%" r="55%">
      <stop offset="0%" stop-color="#22D3EE" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#22D3EE" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="blueGlow" cx="30%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#2563EB" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#2563EB" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="amberGlow" cx="10%" cy="85%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="logoGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#22D3EE" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#22D3EE" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="dividerGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.2" />
      <stop offset="25%" stop-color="#F59E0B" stop-opacity="0.9" />
      <stop offset="75%" stop-color="#F59E0B" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0.2" />
    </linearGradient>

    <linearGradient id="bottomBorder" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#060B1A" />
      <stop offset="15%" stop-color="#F59E0B" />
      <stop offset="50%" stop-color="#F59E0B" />
      <stop offset="85%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#060B1A" />
    </linearGradient>
  </defs>

  <!-- Solid Background Ink -->
  <rect width="1200" height="630" fill="#060B1A" />

  <!-- Aurora / Glow Layers -->
  <rect width="1200" height="630" fill="url(#blueGlow)" />
  <rect width="1200" height="630" fill="url(#cyanGlow)" />
  <rect width="1200" height="630" fill="url(#amberGlow)" />

  <!-- Decorative Geometry (Subtle Circles) -->
  <circle cx="950" cy="120" r="280" stroke="rgba(255,255,255,0.04)" stroke-width="1.5" fill="none" />
  <circle cx="950" cy="120" r="420" stroke="rgba(255,255,255,0.02)" stroke-width="1.5" fill="none" />
  <circle cx="230" cy="315" r="200" fill="url(#logoGlow)" />

  <!-- Logo Emblem -->
  <image href="data:image/png;base64,${logoBase64}" x="90" y="175" width="280" height="280" />

  <!-- Vertical Divider -->
  <rect x="420" y="145" width="3" height="340" fill="url(#dividerGrad)" rx="1.5" />

  <!-- Text Block -->
  <!-- Eyebrow -->
  <text x="465" y="218" class="eyebrow">PHNOM PENH TEACHER EDUCATION COLLEGE</text>

  <!-- Title -->
  <text x="465" y="295" class="title-line1">The Digital</text>
  <text x="465" y="375" class="title-line2">Library</text>

  <!-- Subtitle -->
  <text x="465" y="445" class="subtitle">Free books, research &amp; teaching resources</text>

  <!-- Bottom Accent Bar -->
  <rect x="0" y="624" width="1200" height="6" fill="url(#bottomBorder)" />
</svg>
  `.trim();

  const svgBuffer = Buffer.from(svg);

  // Generate PNG
  await sharp(svgBuffer)
    .png({ compressionLevel: 9 })
    .toFile(PNG_OUT);
  console.log(`✓ Generated ${path.relative(ROOT, PNG_OUT)}`);

  // Generate JPG
  await sharp(svgBuffer)
    .jpeg({ quality: 92 })
    .toFile(JPG_OUT);
  console.log(`✓ Generated ${path.relative(ROOT, JPG_OUT)}`);
}

generateOGImages().catch((err) => {
  console.error("Failed to generate OG images:", err);
  process.exit(1);
});
