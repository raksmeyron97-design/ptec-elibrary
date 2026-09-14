import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// ──────────────────────────────────────────────────────────────────
// Guards the glass interaction layer (docs/MOBILE-GLASS-UI.md).
//
// Glass is translucent, so its contrast is not a property of the token —
// it depends on whatever scrolls underneath. The honest measure is the
// WORST backdrop, and on a phone that backdrop is real, not theoretical:
// the homepage hero (#060B1A, effectively black) sits under the tab bar
// on first load in light mode, and a pale book cover sits under it in dark
// mode. So every pair is flattened over black (light theme) or white (dark
// theme) before it is measured.
//
// The numbers this pins are the reason the opacities are what they are:
// the 0.68 a generic glass recipe suggests gives --ptec-text-body 3.4:1
// over the hero. That is a rule-of-thumb value; this file is the rule.
// ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const CSS = fs.readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");

function themeBlock(selector: string): string {
  const start = CSS.indexOf(selector);
  expect(start, `${selector} block not found`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) return CSS.slice(open, i);
  }
  throw new Error(`unterminated ${selector}`);
}

const LIGHT = themeBlock(":root {");
const DARK = themeBlock(":root.dark {");

function tokenValue(block: string, name: string): string {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(block);
  expect(match, `${name} not declared`).not.toBeNull();
  return match![1].trim();
}

type RGB = [number, number, number];

function parseColor(value: string): { rgb: RGB; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    return { rgb: [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as RGB, alpha: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => Number(p.trim()));
    return { rgb: [parts[0], parts[1], parts[2]] as RGB, alpha: parts[3] ?? 1 };
  }
  throw new Error(`unparseable colour: ${value}`);
}

function composite(value: string, backdrop: RGB): RGB {
  const { rgb, alpha } = parseColor(value);
  return rgb.map((c, i) => c * alpha + backdrop[i] * (1 - alpha)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMED = [
  "--ptec-glass-bg",
  "--ptec-glass-bg-strong",
  "--ptec-glass-bg-sheet",
  "--ptec-glass-fallback",
  "--ptec-glass-border",
  "--ptec-glass-edge",
  "--ptec-glass-highlight",
  "--ptec-glass-shadow",
  "--ptec-glass-selected",
] as const;

const THEMES = [
  { name: "light", block: LIGHT, worst: [0, 0, 0] as RGB },
  { name: "dark", block: DARK, worst: [255, 255, 255] as RGB },
] as const;

describe("glass tokens", () => {
  it("declares every themed glass token in BOTH themes", () => {
    for (const token of THEMED) {
      expect(tokenValue(LIGHT, token)).toBeTruthy();
      expect(tokenValue(DARK, token)).toBeTruthy();
    }
  });

  it("maps the selected-tab tint to a Tailwind colour", () => {
    expect(CSS.includes("--color-glass-selected: var(--ptec-glass-selected);")).toBe(true);
  });

  it("keeps LABEL glass legible over the worst backdrop (text-body, heading, brand ≥ 4.5:1)", () => {
    for (const { name, block, worst } of THEMES) {
      const surface = composite(tokenValue(block, "--ptec-glass-bg-strong"), worst);
      for (const text of ["--ptec-text-body", "--ptec-text-heading", "--ptec-brand"]) {
        const ratio = contrast(parseColor(tokenValue(block, text)).rgb, surface);
        expect(ratio, `${name}: ${text} on strong glass = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps SHEET glass legible for secondary text too (text-muted ≥ 4.5:1)", () => {
    for (const { name, block, worst } of THEMES) {
      const surface = composite(tokenValue(block, "--ptec-glass-bg-sheet"), worst);
      for (const text of ["--ptec-text-muted", "--ptec-text-body", "--ptec-text-heading", "--ptec-brand"]) {
        const ratio = contrast(parseColor(tokenValue(block, text)).rgb, surface);
        expect(ratio, `${name}: ${text} on sheet glass = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the fallback opaque, so a no-blur browser gets exact contrast", () => {
    for (const { name, block } of THEMES) {
      expect(parseColor(tokenValue(block, "--ptec-glass-fallback")).alpha, name).toBe(1);
    }
  });

  it("keeps the active indicator visible behind a brand icon (≥ 3:1, non-text)", () => {
    for (const { name, block, worst } of THEMES) {
      const glass = composite(tokenValue(block, "--ptec-glass-bg-strong"), worst);
      const selected = composite(tokenValue(block, "--ptec-glass-selected"), glass);
      const ratio = contrast(parseColor(tokenValue(block, "--ptec-brand")).rgb, selected);
      expect(ratio, `${name}: brand icon on selected indicator = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("honours reduced transparency and forced colours", () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*\{\s*\.glass-surface/);
    expect(CSS).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.glass-surface/);
    expect(CSS).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  });
});

describe("the phone shell's geometry is declared once", () => {
  it("defines the tab-bar clearance and zeroes it where there is no tab bar", () => {
    expect(tokenValue(LIGHT, "--ptec-mobile-nav-clearance")).toContain("env(safe-area-inset-bottom");
    expect(CSS).toMatch(/@media \(min-width: 64rem\)\s*\{\s*:root\s*\{\s*--ptec-mobile-nav-clearance:\s*0px;/);
  });

  it("no component hand-writes the tab bar's height any more", () => {
    // Every one of these was a private copy of "64px tall, plus the home
    // indicator": 64px, 4.5rem, 5.5rem, 76px + 14px. They drifted apart by
    // 8px before anyone noticed. Reserve var(--ptec-mobile-nav-clearance).
    //
    // git grep reads tracked files only — a brand-new component is invisible
    // to it until `git add`, so `ls-files --others` is unioned in.
    const tracked = execFileSync("git", ["ls-files", "app", "components"], { cwd: ROOT, encoding: "utf8" });
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "app", "components"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const files = [...tracked.split("\n"), ...untracked.split("\n")].filter((f) => /\.(tsx|ts)$/.test(f));
    // `[^)\]]{0,24}` spans an added term like the footer's `64px+1.5rem+env(`.
    const HAND_WRITTEN = /(?:64px|76px|4\.5rem|5\.5rem)[^)\]]{0,24}env\(safe-area-inset-bottom/;
    const offenders = files.filter((f) => {
      const full = path.join(ROOT, f);
      return fs.existsSync(full) && HAND_WRITTEN.test(fs.readFileSync(full, "utf8"));
    });
    expect(offenders).toEqual([]);
  });
});
