// scripts/capture-pwa-screenshots.mjs
// Captures the install-sheet screenshots app/manifest.ts lists, from a live
// site, into public/pwa/screenshots/ (never precached — lib/sw-policy.ts).
//
//   node scripts/capture-pwa-screenshots.mjs                    # production
//   node scripts/capture-pwa-screenshots.mjs http://localhost:3000
//
// 390×844 CSS px at 2× → 780×1688, the size and ratio the manifest declares.
// Reduced motion, so nothing is caught mid-animation; the first visit's boot
// screen is waited out; every non-GET request is aborted (read-only against
// production). Re-run after a visual redesign.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] ?? "https://library.ptec.edu.kh").replace(/\/$/, "");
const OUT = path.join(process.cwd(), "public", "pwa", "screenshots");
const SHOTS = [
  ["home.png", "/"],
  ["books.png", "/books"],
  ["path.png", "/paths/early-grade-reading"],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
// Read-only against a live site: every non-GET request is aborted, so no
// analytics beacon, reader event or server action is ever written.
await context.route("**/*", (route) =>
  route.request().method() === "GET" ? route.continue() : route.abort(),
);
const page = await context.newPage();
for (const [file, route] of SHOTS) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-ptec-shell-ready]", { state: "attached", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, file) });
  console.log(`✓ ${file}  ← ${BASE}${route}`);
}
await browser.close();
