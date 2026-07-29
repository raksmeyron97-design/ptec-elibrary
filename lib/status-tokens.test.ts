import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ──────────────────────────────────────────────────────────────────
// Guards the status SURFACE tokens (--ptec-{success,warning,danger,info}-
// {soft,line,text}) and the brand-tinted surface.
//
// These exist because the four status tokens that predate them are
// text-on-page colours only, so every callout in the app hand-wrote its own
// `bg-green-50 border-green-300 text-green-900` plus a second `dark:`
// triplet. That is how the same "warning" ended up looking slightly
// different on almost every screen.
//
// Two things must stay true or the consolidation quietly comes undone:
//   1. every pair keeps its contrast in BOTH themes;
//   2. a consumer never needs a `dark:` variant — the token already resolves
//      per theme, and the moment one call site adds `dark:bg-…` next to a
//      status token, the drift is back.
// ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const CSS = fs.readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");

/** The `:root { … }` block (light) and the `:root.dark { … }` block. */
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

// ── colour maths ────────────────────────────────────────────────────────────

type RGB = [number, number, number];

function parseColor(value: string): { rgb: RGB; alpha: number } {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    return {
      rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB,
      alpha: 1,
    };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => Number(p.trim()));
    return { rgb: [parts[0], parts[1], parts[2]] as RGB, alpha: parts[3] ?? 1 };
  }
  throw new Error(`unparseable colour: ${value}`);
}

/** Flatten a possibly-translucent colour over an opaque backdrop. */
function composite(value: string, backdrop: RGB): RGB {
  const { rgb, alpha } = parseColor(value);
  return rgb.map((c, i) => Math.round(c * alpha + backdrop[i] * (1 - alpha))) as RGB;
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

const STATUSES = ["success", "warning", "danger", "info"] as const;

describe("status surface tokens", () => {
  it("declares soft / line / text for every status in both themes", () => {
    for (const status of STATUSES) {
      for (const part of ["soft", "line", "text"] as const) {
        expect(tokenValue(LIGHT, `--ptec-${status}-${part}`)).toBeTruthy();
        expect(tokenValue(DARK, `--ptec-${status}-${part}`)).toBeTruthy();
      }
    }
  });

  it("exposes each token to Tailwind as a --color-* theme entry", () => {
    // Without this the utilities (bg-success-soft, …) simply do not exist,
    // and a typo'd class silently renders no background at all.
    for (const status of STATUSES) {
      for (const part of ["soft", "line", "text"] as const) {
        expect(
          CSS.includes(`--color-${status}-${part}: var(--ptec-${status}-${part});`),
          `--color-${status}-${part} not mapped`,
        ).toBe(true);
      }
    }
    for (const part of ["soft", "line"] as const) {
      expect(
        CSS.includes(`--color-surface-brand-${part}: var(--ptec-surface-brand-${part});`),
      ).toBe(true);
    }
  });

  it("keeps text-on-soft at WCAG AA (4.5:1) in LIGHT theme", () => {
    const page = parseColor(tokenValue(LIGHT, "--ptec-bg-surface")).rgb;
    for (const status of STATUSES) {
      const soft = composite(tokenValue(LIGHT, `--ptec-${status}-soft`), page);
      const text = composite(tokenValue(LIGHT, `--ptec-${status}-text`), soft);
      const ratio = contrast(text, soft);
      expect(ratio, `light ${status}: text on soft = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps text-on-soft at WCAG AA (4.5:1) in DARK theme", () => {
    // Dark soft tints are translucent, so they must be flattened over the
    // surface they actually sit on before measuring.
    const surface = parseColor(tokenValue(DARK, "--ptec-bg-surface")).rgb;
    for (const status of STATUSES) {
      const soft = composite(tokenValue(DARK, `--ptec-${status}-soft`), surface);
      const text = composite(tokenValue(DARK, `--ptec-${status}-text`), soft);
      const ratio = contrast(text, soft);
      expect(ratio, `dark ${status}: text on soft = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the soft surface distinguishable from the card it sits on", () => {
    // A tint nobody can see is not a status surface. 1.03:1 is deliberately
    // a floor against "invisible", not a legibility threshold — the text
    // contrast assertions above carry that.
    for (const [block, label] of [
      [LIGHT, "light"],
      [DARK, "dark"],
    ] as const) {
      const surface = parseColor(tokenValue(block, "--ptec-bg-surface")).rgb;
      for (const status of STATUSES) {
        const soft = composite(tokenValue(block, `--ptec-${status}-soft`), surface);
        const ratio = contrast(soft, surface);
        expect(ratio, `${label} ${status}: soft vs surface = ${ratio.toFixed(3)}:1`).toBeGreaterThan(1.03);
      }
    }
  });

  it("keeps `info` on the PTEC blue ramp, not a second informational blue", () => {
    // An informational callout should read as part of the brand. These are
    // blue-50 / blue-200 / blue-900 from the PTEC ramp.
    expect(tokenValue(LIGHT, "--ptec-info-soft").toUpperCase()).toBe("#EEF2FB");
    expect(tokenValue(LIGHT, "--ptec-info-line").toUpperCase()).toBe("#B3C5EF");
    expect(tokenValue(LIGHT, "--ptec-info-text").toUpperCase()).toBe("#122251");
  });
});

describe("status tokens in the About pages", () => {
  const FILES = [
    ...fs
      .readdirSync(path.join(ROOT, "components", "about"))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => path.join("components", "about", f)),
    ...["our-journey", "rules", "timings", "collection", "team"].map((p) =>
      path.join("app", "[locale]", "(public)", "about", p, "page.tsx"),
    ),
  ];

  const sources = FILES.map((f) => ({ file: f, src: fs.readFileSync(path.join(ROOT, f), "utf8") }));

  it("never pairs a status token with a `dark:` variant", () => {
    // The whole point of the tokens is that they already resolve per theme.
    // A `dark:bg-…` next to one means someone re-introduced the two-triplet
    // pattern these replaced.
    const offenders = sources
      .filter(({ src }) => /dark:(bg|border|text)-(success|warning|danger|info)-/.test(src))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("uses no hand-written status palette pairs", () => {
    // e.g. `bg-green-50 dark:bg-green-500/10` — the exact shape the tokens
    // exist to remove.
    const offenders = sources
      .filter(({ src }) => /dark:(bg|border|text)-(green|amber|red)-[0-9]/.test(src))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("does not restate the focus indicator the base layer already paints", () => {
    // app/globals.css paints `outline: var(--focus-ring-width) solid
    // var(--focus-color)` on every a/button/input/summary/[tabindex] in
    // @layer base. Restating it pins the width and colour against future
    // token changes and re-creates the double-indicator bug #51 fixed.
    // Deviations are expressed as token overrides ([--focus-color:…],
    // [--focus-ring-offset:…]), which this pattern deliberately allows.
    const offenders = sources
      .filter(({ src }) => /focus-visible:outline(-|\s|")/.test(src))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
