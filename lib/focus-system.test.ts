// lib/focus-system.test.ts
//
// Guards the global keyboard-focus system in app/globals.css.
//
// The bug this file exists to prevent: the `:focus-visible` fallback used to be
// declared UNLAYERED. An unlayered normal declaration beats every rule in
// Tailwind v4's `@layer utilities`, so `outline-none` and
// `focus-visible:outline-none` were silently inert across the whole app — every
// control that painted its own `focus-visible:ring-*` ALSO got the global 2px
// outline, and every grouped search field showed one indicator on the wrapper
// plus a second blue rectangle hugging the inner input.
//
// The contract now:
//   • the fallback lives in `@layer base`, so component utilities can override it
//   • every focus value is a token, never a hardcoded width/colour/duration
//   • grouped fields use `.focus-shell`, which is keyboard-weighted via
//     `:has(… :focus-visible)` rather than a mouse-triggered `focus-within`
//   • box-shadow halos have a forced-colors fallback (forced-colors drops shadows)
//
// See also: docs/ACCESSIBILITY-FOCUS.md

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const SELF = "lib/focus-system.test.ts";

/** Repo-wide fixed-string search over tracked source files (respects .gitignore). */
function grepSource(needle: string, globs = ["*.ts", "*.tsx"]): string[] {
  try {
    const out = execFileSync("git", ["grep", "-l", "-F", needle, "--", ...globs], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean).filter((f) => f !== SELF);
  } catch {
    return []; // git grep exits 1 on no matches
  }
}

/** Extract the body of a top-level `@layer <name> { … }` block, brace-matched. */
function layerBody(name: string): string {
  const start = CSS.indexOf(`@layer ${name} {`);
  if (start === -1) return "";
  let depth = 0;
  for (let i = CSS.indexOf("{", start); i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) {
      return CSS.slice(CSS.indexOf("{", start) + 1, i);
    }
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The root cause: the fallback must be layered
// ─────────────────────────────────────────────────────────────────────────────

describe("keyboard focus fallback", () => {
  const FALLBACK = ":where(a, button, input, select, textarea, summary, [tabindex]):focus-visible";

  it("declares the :focus-visible fallback exactly once outside forced-colors", () => {
    // Two copies exist by design: the layered default, and the forced-colors
    // override. Any third is a competing indicator.
    const occurrences = CSS.split(FALLBACK).length - 1;
    expect(occurrences).toBe(2);
  });

  it("puts the default fallback inside @layer base so utilities can override it", () => {
    // This is the whole fix. If the fallback escapes the layer, `outline-none`
    // stops working app-wide and the double blue border comes back.
    expect(layerBody("base")).toContain(FALLBACK);
  });

  it("keeps the forced-colors override unlayered so it wins over ring utilities", () => {
    const forced = CSS.slice(CSS.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain(FALLBACK);
    expect(layerBody("base")).not.toContain("CanvasText");
  });

  it("never sets border-radius on the focused element", () => {
    // An outline already follows the element's own radius. Forcing one reshapes
    // the control itself on focus, which is a layout change, not an indicator.
    const base = layerBody("base");
    const rule = base.slice(base.indexOf(FALLBACK), base.indexOf("}", base.indexOf(FALLBACK)));
    expect(rule).not.toContain("border-radius");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Everything is a token
// ─────────────────────────────────────────────────────────────────────────────

describe("focus tokens", () => {
  const TOKENS = [
    "--focus-color",
    "--focus-ring-color",
    "--focus-ring-width",
    "--focus-ring-offset",
    "--focus-border-color",
    "--focus-border-color-soft",
    "--focus-transition-duration",
    "--focus-ring-shadow",
  ];

  it.each(TOKENS)("defines %s on :root", (token) => {
    expect(CSS).toMatch(new RegExp(`${token}\\s*:`));
  });

  it("derives the focus colour from the existing PTEC ring token", () => {
    // Not a new bright blue: --ptec-focus-ring is blue-500 light / blue-300 dark
    // and already flips with the theme.
    expect(CSS).toMatch(/--focus-color:\s*var\(--ptec-focus-ring\)/);
    expect(CSS).toMatch(/--focus-border-color:\s*var\(--ptec-focus-ring\)/);
  });

  it("keeps the ring at 2px and the transition inside the 120–180ms band", () => {
    expect(CSS).toMatch(/--focus-ring-width:\s*2px/);
    const duration = CSS.match(/--focus-transition-duration:\s*(\d+)ms/);
    expect(duration).not.toBeNull();
    expect(Number(duration![1])).toBeGreaterThanOrEqual(120);
    expect(Number(duration![1])).toBeLessThanOrEqual(180);
  });

  it("ships a halo tint for both themes", () => {
    expect(CSS).toMatch(/:root\s*\{[\s\S]*?--ptec-focus-halo:/);
    expect(CSS).toMatch(/:root\.dark\s*\{[\s\S]*?--ptec-focus-halo:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Grouped fields: one indicator, keyboard-weighted
// ─────────────────────────────────────────────────────────────────────────────

describe(".focus-shell", () => {
  const components = layerBody("components");
  /** Everything outside `@layer …` — where the focus STATE rules must live. */
  const unlayered = CSS.split("@layer components {")[0] + CSS.split(/@layer components \{[\s\S]*?\n\}/)[1];

  it("keeps only the transition and token modifiers in @layer components", () => {
    // Cosmetic, overridable by a call site's own `transition-*` utility.
    expect(components).toMatch(/\.focus-shell,\s*\n?\s*\.focus-field \{/);
    expect(components).toContain(".focus-underline");
    expect(components).toContain(".focus-inset");
    // …but never a state rule: those would lose to `border-*` / `shadow-*`.
    expect(components).not.toContain(":focus-visible");
  });

  it("declares the focus state rules unlayered so they beat border/shadow utilities", () => {
    // A shell already carries `border-divider` and `shadow-sm`. Tailwind v4 puts
    // those in `@layer utilities`, which outranks every earlier layer whatever
    // the specificity — inside `@layer components` the shell computed to its
    // resting border and resting shadow and looked identical when focused.
    expect(unlayered).toContain(
      ".focus-shell:has(:is(input, textarea, select, [contenteditable]):focus-visible)",
    );
    expect(unlayered).toContain(".focus-field:focus-visible");
  });

  it("gates the halo on :has(:focus-visible), not focus-within", () => {
    // focus-within fires on mouse click too, which is how a click came to paint
    // the same heavy ring as a Tab press.
    expect(CSS).not.toMatch(/\.focus-shell:focus-within/);
    expect(CSS).toMatch(/box-shadow:\s*var\(--focus-ring-shadow\)/);
  });

  it("gives pointer focus a border shift only — no halo", () => {
    const start = CSS.indexOf(
      ".focus-shell:has(:is(input, textarea, select, [contenteditable]):focus)",
    );
    const body = CSS.slice(start, CSS.indexOf("}", start));
    expect(body).toContain("--focus-border-color-soft");
    expect(body).not.toContain("box-shadow");
  });

  it("neutralises legacy focus:ring-* fields under pointer modality", () => {
    // ~150 fields predate this system and ring on plain `:focus`, i.e. on click.
    // One rule disarms them rather than 150 call-site edits; buttons are
    // untouched because they already don't match :focus-visible on click.
    expect(CSS).toContain(
      ':root[data-focus-modality="pointer"] :is(input, textarea, select):focus',
    );
    expect(CSS).toMatch(/--tw-ring-shadow:\s*0 0 #0000/);
    expect(CSS).toMatch(/--tw-ring-offset-shadow:\s*0 0 #0000/);
  });

  it("reserves the halo for keyboard modality, and defaults to showing it", () => {
    // `:not([… = "pointer"])` rather than `[… = "keyboard"]`: with the attribute
    // absent (JS off, or before the first interaction) the halo must still show.
    expect(CSS).toContain(':root:not([data-focus-modality="pointer"])');
    expect(CSS).not.toMatch(/:root\[data-focus-modality="keyboard"\]/);
  });

  it("suppresses the inner control's own indicator", () => {
    expect(unlayered).toMatch(
      /\.focus-shell :is\(input, textarea, select, \[contenteditable\]\):focus-visible[\s\S]{0,80}outline: none/,
    );
  });

  it("keeps error state legible under keyboard focus", () => {
    expect(CSS).toContain('.focus-shell:has([aria-invalid="true"]:focus-visible)');
    expect(CSS).toContain('.focus-field[aria-invalid="true"]:focus-visible');
    expect(CSS).toMatch(/var\(--ptec-danger\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3b. Input-modality tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("input modality", () => {
  const csp = readFileSync(path.join(ROOT, "lib/csp.ts"), "utf8");

  it("is set by the single pre-paint inline script, not a hydrated component", () => {
    // It has to beat first paint: an effect-based flag would flash the keyboard
    // treatment on the first click of every page load.
    expect(csp).toContain('root.setAttribute("data-focus-modality"');
    expect(csp).toContain('addEventListener("pointerdown"');
    expect(csp).toContain('addEventListener("keydown"');
  });

  it("only promotes to keyboard on traversal keys", () => {
    // Typing into an already-clicked field must not summon the halo.
    const handler = csp.slice(csp.indexOf('addEventListener("keydown"'));
    expect(handler).toContain('e.key === "Tab"');
    expect(handler).toContain('e.key.startsWith("Arrow")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Environment fallbacks
// ─────────────────────────────────────────────────────────────────────────────

describe("environment fallbacks", () => {
  it("restores a real outline in forced-colors mode, where box-shadow is dropped", () => {
    const forced = CSS.slice(CSS.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain("CanvasText");
    expect(forced).toContain(".focus-shell:has(");
    expect(forced).toContain(".focus-field:focus-visible");
    // The now-invisible halo must be suppressed, not left stacked underneath.
    expect(forced).toContain("box-shadow: none");
  });

  it("removes the focus transition under prefers-reduced-motion", () => {
    const reduced = CSS.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.focus-shell,\s*\.focus-field \{\s*transition: none;/,
    );
    expect(reduced).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Call sites cannot reintroduce a second indicator
// ─────────────────────────────────────────────────────────────────────────────

describe("call sites", () => {
  it("never pairs .focus-shell with a focus-within ring on the same element", () => {
    const shellFiles = grepSource("focus-shell");
    expect(shellFiles.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of shellFiles) {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      for (const line of src.split("\n")) {
        if (!line.includes("focus-shell")) continue;
        if (/focus-within:(ring|border|shadow)/.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the shared Button free of its own focus ring", () => {
    // The base-layer outline already covers it, follows the button's radius and
    // survives forced-colors. A ring here would be indicator number two.
    const button = readFileSync(path.join(ROOT, "components/ui/core/Button.tsx"), "utf8");
    expect(button).not.toMatch(/focus(-visible)?:ring/);
    expect(button).not.toMatch(/focus(-visible)?:outline-none/);
  });

  it("does not hardcode a non-PTEC focus blue in shared form fields", () => {
    // #4f46e5 was an indigo that belonged to no token and matched nothing else
    // in the admin panel.
    expect(grepSource("focus:ring-[#4f46e5]")).toEqual([]);
    expect(grepSource("focus:border-[#4f46e5]")).toEqual([]);
  });
});
