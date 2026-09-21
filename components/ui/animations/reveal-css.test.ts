// components/ui/animations/reveal-css.test.ts
//
// THE REVEAL MAY ONLY HIDE WHERE IT CAN ALSO SHOW.
//
// `.reveal` fades an element up as it scrolls into view with a scroll-driven
// animation. Its first keyframe is `opacity: 0`, and `animation-fill-mode:
// both` applies that keyframe to everything not yet scrolled to. So the rule
// is only safe where the animation can run to its end: a browser without
// scroll-driven animations (Firefox; Safari before 26) must never see it, or
// the cards below the fold stay invisible forever — and a reader who asked
// for reduced motion must never see it either. Both guards live in the CSS,
// so they are pinned here, from the source, the way reader-css.test.ts pins
// the cascade layer.
//
// Also pinned: the rule is layered (it sits on elements that carry
// utilities), and the old observer-driven machinery is gone for good — the
// wrappers ship no client JavaScript.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selector: string; body: string; ancestors: string[] };

/** Every leaf declaration block, with the at-rule preludes that enclose it. */
function rules(source: string): Rule[] {
  const out: Rule[] = [];
  const stack: string[] = [];
  let head = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      const prelude = head.trim();
      let depth = 1;
      let j = i + 1;
      for (; j < source.length && depth > 0; j++) {
        if (source[j] === "{") depth++;
        else if (source[j] === "}") depth--;
      }
      const body = source.slice(i + 1, j - 1);
      if (!body.includes("{")) out.push({ selector: prelude, body, ancestors: [...stack] });
      stack.push(prelude);
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

const all = rules(css);
const revealRules = all.filter((r) => r.selector.split(",").some((s) => /(^|\s)\.reveal$/.test(s.trim())));
const keyframes = all.filter((r) => r.ancestors.some((a) => /^@keyframes\s+reveal-in$/.test(a)));

describe("scroll reveal CSS", () => {
  it("declares .reveal at all (the guards below would pass vacuously without it)", () => {
    expect(revealRules.length).toBeGreaterThan(0);
  });

  it("puts every .reveal rule behind @supports (animation-timeline: view())", () => {
    for (const r of revealRules) {
      expect(r.ancestors.some((a) => /^@supports\s*\(\s*animation-timeline:\s*view\(\)\s*\)$/.test(a)), r.ancestors.join(" > ")).toBe(true);
    }
  });

  it("puts every .reveal rule behind (prefers-reduced-motion: no-preference)", () => {
    for (const r of revealRules) {
      expect(r.ancestors.some((a) => /^@media\s*\(\s*prefers-reduced-motion:\s*no-preference\s*\)$/.test(a)), r.ancestors.join(" > ")).toBe(true);
    }
  });

  it("layers every .reveal rule, so the utilities on the same element still win", () => {
    for (const r of revealRules) expect(r.ancestors.some((a) => /^@layer\b/.test(a))).toBe(true);
  });

  it("insets the view by the phone tab bar, so nothing finishes revealing behind it", () => {
    expect(revealRules.some((r) => /animation-timeline:\s*view\(\s*block\s+auto\s+var\(--ptec-mobile-nav-clearance\)\s*\)/.test(r.body))).toBe(true);
  });

  it("animates opacity and transform only", () => {
    expect(keyframes.length).toBeGreaterThan(0);
    for (const k of keyframes) {
      const props = k.body
        .split(";")
        .map((d) => d.split(":")[0].trim())
        .filter(Boolean);
      expect(props.every((p) => p === "opacity" || p === "transform"), props.join(",")).toBe(true);
    }
  });

  it("keeps no trace of the observer-driven reveal", () => {
    expect(css).not.toMatch(/\.scroll-reveal/);
    expect(css).not.toMatch(/data-revealed/);
    for (const file of ["ScrollRevealWrapper.tsx", "StaggerGrid.tsx"]) {
      const src = readFileSync(path.join(__dirname, file), "utf8").replace(/\/\/.*$/gm, "");
      expect(src, file).not.toMatch(/["']use client["']/);
      expect(src, file).not.toMatch(/IntersectionObserver|useEffect|useRef/);
    }
  });
});
