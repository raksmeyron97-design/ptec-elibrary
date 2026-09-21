// components/ui/reader/reader-css.test.ts
//
// AN UNLAYERED RULE BEATS EVERY LAYERED ONE.
//
// Tailwind v4 puts its utilities in `@layer utilities`, and a rule written
// outside any layer outranks all of them regardless of specificity. So an
// unlayered `.reader-btn { display: inline-flex }` silently defeated `hidden`,
// `md:hidden` and `md:inline-flex` on every reader HUD button: phones drew the
// desktop-only search, panel, theme and bookmark controls in the top bar,
// beside the bottom bar's own bookmark and panel, and desktops drew the
// phone-only page pill, bookmark and panel.
//
// This is the same trap as the focus system's `:focus-visible` fallback
// (docs/ACCESSIBILITY-FOCUS.md, "Layering, which is load-bearing"), and it is
// invisible to jsdom, to a production build and to any test that renders the
// component — the markup is correct; the cascade is not. Hence a source scan.
//
// The rule enforced is the DEFECT CLASS, not one line: no unlayered rule
// anywhere in globals.css may set `display` on `.reader-btn`, nor on any
// other reader component class that a call site hides by breakpoint
// (`.reader-scrubber`, MUX-05) — LAYERED_COMPONENT_CLASSES below.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const cssSource = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

/** Comments can contain anything, including the rule this file forbids — the
 *  fix's own explanation quotes it. Strip them before scanning. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

type Rule = { selector: string; body: string; layered: boolean };

/**
 * Every declaration block in the stylesheet, with whether an `@layer` encloses
 * it. Brace-tracked rather than regex-matched: the question is nesting depth,
 * and a regex cannot answer it — which is how the first version of this scan
 * passed only because of how a comment happened to be indented.
 */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  // Stack of open blocks; `true` once an `@layer` is anywhere above us.
  const stack: boolean[] = [];
  let head = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      const selector = head.trim();
      const inLayer = stack.some(Boolean) || /^@layer\b/.test(selector);
      // Find this block's body so a leaf rule can be inspected whole.
      let depth = 1;
      let j = i + 1;
      for (; j < css.length && depth > 0; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
      }
      const body = css.slice(i + 1, j - 1);
      // A leaf rule (no nested block) is a real declaration block.
      if (!body.includes("{")) out.push({ selector, body, layered: inLayer });
      stack.push(inLayer);
      head = "";
      continue;
    }
    if (ch === "}") {
      stack.pop();
      head = "";
      continue;
    }
    head += ch;
  }
  return out;
}

/** Selector lists that target a bare class (not a variant such as
 *  `.reader-btn--pill`, and not a state such as `.reader-btn:hover`). */
function targetsBase(selector: string, cls: string): boolean {
  const bare = new RegExp(`(^|[\\s>+~])\\${cls}$`);
  return selector
    .split(",")
    .map((s) => s.trim())
    .some((s) => bare.test(s));
}

// Every reader component class that sets `display` and is also given a
// breakpoint utility (`hidden`, `md:hidden`, `md:inline-flex`) at its call
// site. Each must set display from INSIDE a layer, or the utility loses.
const LAYERED_COMPONENT_CLASSES: { cls: string; source: string; breakpoints: RegExp[] }[] = [
  {
    cls: ".reader-btn",
    source: "ReaderHUD.tsx",
    breakpoints: [/className="reader-btn[^"]*\bhidden md:inline-flex/, /className="reader-btn[^"]*\bmd:hidden/],
  },
  { cls: ".reader-scrubber", source: "ReaderScrubber.tsx", breakpoints: [/className="reader-scrubber[^"]*\bmd:hidden/] },
];

describe("reader chrome CSS", () => {
  const all = rules(stripComments(cssSource));

  for (const { cls, source, breakpoints } of LAYERED_COMPONENT_CLASSES) {
    const base = all.filter((r) => targetsBase(r.selector, cls) && /(^|[;\s])display\s*:/.test(r.body));

    it(`declares the ${cls} base rule at all`, () => {
      // Guards the next assertion, which would pass vacuously if the rule
      // were renamed or deleted.
      expect(base.length).toBeGreaterThan(0);
    });

    it(`sets ${cls}'s display only from inside a cascade layer`, () => {
      const unlayered = base.filter((r) => !r.layered).map((r) => r.selector);
      expect(unlayered).toEqual([]);
    });

    it(`keeps the breakpoint classes on ${cls} in ${source} that the layering exists to make work`, () => {
      // If the cascade bug is ever 'fixed' by deleting these instead, the rule
      // above would still pass while the layout went back to drawing both.
      const markup = readFileSync(path.join(__dirname, source), "utf8");
      for (const breakpoint of breakpoints) expect(markup).toMatch(breakpoint);
    });
  }
});
