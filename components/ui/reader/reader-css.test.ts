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
// anywhere in globals.css may set `display` on `.reader-btn`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const cssSource = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const hudSource = readFileSync(path.join(__dirname, "ReaderHUD.tsx"), "utf8");

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

/** Selector lists that target the bare `.reader-btn` class (not a variant such
 *  as `.reader-btn--pill`, and not a state such as `.reader-btn:hover`). */
function targetsBaseReaderBtn(selector: string): boolean {
  return selector
    .split(",")
    .map((s) => s.trim())
    .some((s) => /(^|[\s>+~])\.reader-btn$/.test(s));
}

describe("reader chrome CSS", () => {
  const all = rules(stripComments(cssSource));
  const base = all.filter((r) => targetsBaseReaderBtn(r.selector) && /(^|[;\s])display\s*:/.test(r.body));

  it("declares the .reader-btn base rule at all", () => {
    // Guards the other assertions: they would both pass vacuously if the rule
    // were renamed or deleted, and the HUD would then lose its 44 px targets.
    expect(base.length).toBeGreaterThan(0);
  });

  it("sets .reader-btn's display only from inside a cascade layer", () => {
    const unlayered = base.filter((r) => !r.layered).map((r) => r.selector);
    expect(unlayered).toEqual([]);
  });

  it("keeps the breakpoint classes the layering exists to make work", () => {
    // If the cascade bug is ever 'fixed' by deleting these instead, the rule
    // above would still pass while the HUD went back to drawing both layouts.
    expect(hudSource).toMatch(/className="reader-btn[^"]*\bhidden md:inline-flex/);
    expect(hudSource).toMatch(/className="reader-btn[^"]*\bmd:hidden/);
  });
});
