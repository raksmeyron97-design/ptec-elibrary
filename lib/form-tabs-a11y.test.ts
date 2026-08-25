// lib/form-tabs-a11y.test.ts
//
// Guards the WAI-ARIA Tabs wiring between `FormTabs` and the panels it claims
// to control.
//
// The bug this file exists to prevent: `FormTabs` emits
// `aria-controls={`${idPrefix}-panel-${key}`}` and focuses that same id on
// keyboard activation, but nothing forced the panels to use those ids. Three of
// the five admin forms had them wrong at once and every check still passed —
// tsc cannot see inside a string, eslint has no opinion, and the rendered page
// looked perfect:
//
//   • team      panels were `panel-identity`, tabs pointed at `team-panel-identity`
//   • paths     stage regions were plain divs with no role or id at all
//   • settings  the content region likewise
//
// So each tablist told a screen reader it controlled a region that did not
// exist, and Enter-to-activate had nothing to focus. This is a source scan
// because that is the only place the mismatch is visible.
//
// The contract:
//   • every `idPrefix="x"` has at least one `x-panel-…` id in the same file
//   • every one of those panels carries role="tabpanel" and is programmatically
//     focusable (`tabIndex={-1}`), which is what FormTabs' Enter handler needs

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/**
 * The full opening tag containing `index`, e.g. `<div id="…" role="tabpanel" …>`.
 *
 * A fixed character window around `role="tabpanel"` cannot do this job: too
 * small and it misses attributes sitting past an inline comment (the thesis
 * panel documents its own tabIndex, which pushed the attribute out of a 240-char
 * window); too large and it bleeds into a sibling element, so the test passes
 * because the *neighbour* was correct. This walks the real boundaries instead —
 * back to the `<`, forward to the `>` that closes it, tracking brace depth so a
 * `>` inside an expression like `{a > b}` is not mistaken for the end.
 */
function openingTagAt(src: string, index: number): string {
  const start = src.lastIndexOf("<", index);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** Files that mount a <FormTabs idPrefix="…">, found rather than hardcoded. */
function formTabsCallSites(): { file: string; prefixes: string[] }[] {
  const out = execFileSync(
    "git",
    ["grep", "-l", "-e", 'idPrefix="', "--", "components", "app"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((file) => {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      // Only prefixes belonging to a FormTabs mount; other components take an
      // `idPrefix` prop of their own (ContentWorkspace, for one).
      const prefixes = [...src.matchAll(/<FormTabs[\s\S]{0,400}?idPrefix="([\w-]+)"/g)].map(
        (m) => m[1],
      );
      return { file, prefixes };
    })
    .filter((entry) => entry.prefixes.length > 0);
}

/**
 * The literal tab keys a FormTabs mount will render, or null when they cannot be
 * read statically.
 *
 * `tabs={X.map<FormTab<K>>(…)}` names the source array; if `const X` is declared
 * in the same file with string literals, those are the keys. Settings builds its
 * list at runtime (`navItems`), so it returns null and is covered by the
 * dynamic-panel branch instead.
 */
function literalTabKeys(src: string): string[] | null {
  const mapped = src.match(/tabs=\{(\w+)\.map</);
  if (!mapped) return null;
  const declaration = new RegExp(`const ${mapped[1]}[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(src);
  if (!declaration) return null;
  const body = declaration[1];
  // Either `{ key: "basic", … }` objects or a bare `["details", …]` list.
  const keyed = [...body.matchAll(/\bkey:\s*"([\w-]+)"/g)].map((m) => m[1]);
  if (keyed.length > 0) return keyed;
  const bare = [...body.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
  return bare.length > 0 ? bare : null;
}

describe("FormTabs ↔ tabpanel wiring", () => {
  const sites = formTabsCallSites();

  it("finds every FormTabs call site", () => {
    // A guard on the guard: if the scan silently matches nothing, the rest of
    // this file passes vacuously.
    expect(sites.length).toBeGreaterThanOrEqual(5);
  });

  /*
    Inverted on purpose. The first version of this test asked "does at least one
    `<prefix>-panel-…` id exist in the file", which is far too weak: the team form
    has seven panels, so reverting a single one to the old broken name left six
    matches and the test still passed. Verified by reintroducing the exact
    original bug and watching it go green.

    The contract that actually holds is the other direction — EVERY tabpanel in a
    file that mounts FormTabs must be named for one of that file's prefixes. A
    panel with any other id is unreachable by `aria-controls` and by the Enter
    handler, which is precisely the defect.
  */
  it.each(sites)("$file: every tabpanel is named for one of its tablists", ({ file, prefixes }) => {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    const panels = [...src.matchAll(/role="tabpanel"/g)];
    expect(panels.length, `${file}: mounts FormTabs but declares no tabpanel`).toBeGreaterThan(0);

    /*
      One panel per tab, where the keys can be read statically.

      Counting `role="tabpanel"` alone is not enough, and this is the third
      version of that lesson: deleting a panel outright simply removes it from
      the scan, so the file still had "some" tabpanels and passed. That is
      exactly the shape the paths form shipped in — three stages, zero panels.
      Verified by deleting one and watching this fail.
    */
    const keys = literalTabKeys(src);
    if (keys) {
      for (const prefix of prefixes) {
        const dynamic = new RegExp(`id=\\{\`${prefix}-panel-\\$\\{`).test(src);
        if (dynamic) continue; // one dynamic panel serves every key
        for (const key of keys) {
          expect(
            src.includes(`id="${prefix}-panel-${key}"`),
            `${file}: tab "${key}" has no panel — expected id="${prefix}-panel-${key}"`,
          ).toBe(true);
        }
      }
    }

    for (const panel of panels) {
      const window = openingTagAt(src, panel.index ?? 0);
      const id = window.match(/id=(?:"([\w-]+)"|\{`([\w-]+)-\$\{[^}]+\}`\})/);
      expect(id, `${file}: a tabpanel near offset ${panel.index} has no id`).not.toBeNull();

      const literal = id?.[1];
      const templatePrefix = id?.[2];
      const ok = prefixes.some((prefix) =>
        templatePrefix
          ? templatePrefix === `${prefix}-panel`
          : Boolean(literal?.startsWith(`${prefix}-panel-`)),
      );
      expect(
        ok,
        `${file}: tabpanel id "${literal ?? `${templatePrefix}-\${…}`}" does not match any of ` +
          `[${prefixes.map((p) => `${p}-panel-…`).join(", ")}] — FormTabs' aria-controls and its ` +
          `Enter handler both target that shape, so this panel is unreachable`,
      ).toBe(true);

      expect(window, `${file}: tabpanel "${literal ?? templatePrefix}" is missing tabIndex={-1}`).toContain(
        "tabIndex={-1}",
      );
    }
  });
});

describe("FormTabs keyboard contract", () => {
  const SRC = readFileSync(path.join(ROOT, "components/admin/kit/form/FormTabs.tsx"), "utf8");

  it("implements manual activation, not focus-follows-selection", () => {
    // Arrows must move focus only. If an arrow called `activate`, the panel
    // would swap on every keypress and focus would leave the tablist, so a
    // second arrow press could never reach it.
    expect(SRC).toContain("moveFocus(");
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      const branch = SRC.slice(SRC.indexOf(`case "${key}"`), SRC.indexOf(`case "${key}"`) + 160);
      expect(branch, `${key} must move focus, not activate`).toContain("moveFocus(");
      expect(branch, `${key} must not activate`).not.toContain("activate(");
    }
  });

  it("activates on Enter and Space, and focuses the panel", () => {
    const branch = SRC.slice(SRC.indexOf('case "Enter"'), SRC.indexOf('case "Enter"') + 260);
    expect(branch).toContain('case " "');
    expect(branch).toContain("focusPanel: true");
    // Space scrolls and Enter submits the surrounding form; both need stopping.
    expect(branch).toContain("preventDefault");
  });

  it("keeps exactly one tab in the tab order", () => {
    expect(SRC).toContain("tabIndex={tabbableKey === tab.key ? 0 : -1}");
  });

  it("declares the tablist orientation", () => {
    expect(SRC).toContain('aria-orientation="horizontal"');
  });
});
