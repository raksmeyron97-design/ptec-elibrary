import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Static guard against markup that the HTML parser silently restructures.
 *
 * When a block-level start tag appears inside an open `<p>`, the parser closes
 * the paragraph and re-parents the rest — so the DOM the browser builds does
 * not match the tree React server-rendered, and hydration fails with
 * "server rendered HTML didn't match the client". This is invisible in unit
 * tests (jsdom's fragment parsing and React's own renderer both tolerate it)
 * and invisible in a production build, which is why it needs a source check.
 *
 * The dashboard hit exactly this: `InfoTip` renders `<details>`, and two call
 * sites wrapped it in a `<p>` (2026-07-22).
 *
 * Interactive nesting (a button inside a button, a link inside a link) is
 * checked for the same reason, and because it is also an accessibility defect.
 */

const DASHBOARD_DIRS = [
  "components/admin/dashboard",
  "components/admin/dashboard/views",
];

/** Start tags that make the parser auto-close an open <p>. */
const BLOCK_TAGS = [
  "details", "div", "ul", "ol", "dl", "section", "article", "header", "footer",
  "nav", "table", "figure", "form", "h1", "h2", "h3", "h4", "h5", "h6", "p",
  "pre", "hr", "main", "aside", "blockquote",
];

/** Local components whose root element is block-level. */
const BLOCK_COMPONENTS = ["InfoTip"];

function sourceFiles(): string[] {
  return DASHBOARD_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
      .map((f) => path.join(dir, f)),
  );
}

/** Blank out the angle brackets in comments so prose about tags is not read as markup. */
function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[<>]/g, " ");
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);
}

function findings(): string[] {
  const out: string[] = [];
  for (const file of sourceFiles()) {
    const src = stripComments(readFileSync(file, "utf8"));
    const lineOf = (index: number) => src.slice(0, index).split("\n").length;

    for (const match of src.matchAll(/<p(\s[^>]*?)?>([\s\S]*?)<\/p>/g)) {
      const inner = match[2];
      for (const tag of [...BLOCK_TAGS, ...BLOCK_COMPONENTS]) {
        if (new RegExp(`<${tag}[\\s>/]`).test(inner)) {
          out.push(`${file}:${lineOf(match.index)} — <${tag}> inside <p>`);
        }
      }
    }

    const interactive: [string, string[]][] = [
      ["button", ["button", "a[\\s>]", "Link[\\s/>]"]],
      ["a", ["a[\\s>]", "button[\\s>]"]],
      ["Link", ["Link[\\s/>]", "button[\\s>]"]],
    ];
    for (const [outer, inners] of interactive) {
      const re = new RegExp(`<${outer}(\\s[^>]*?)?>([\\s\\S]*?)</${outer}>`, "g");
      for (const match of src.matchAll(re)) {
        for (const inner of inners) {
          if (new RegExp(`<${inner}`).test(match[2])) {
            out.push(`${file}:${lineOf(match.index)} — interactive element inside <${outer}>`);
          }
        }
      }
    }
  }
  return out;
}

describe("dashboard markup nesting", () => {
  it("never puts a block-level element or InfoTip inside a paragraph", () => {
    // Empty array keeps the failure message readable — it lists the offenders.
    expect(findings().filter((f) => f.includes("inside <p>"))).toEqual([]);
  });

  it("never nests interactive elements", () => {
    expect(findings().filter((f) => f.includes("interactive element"))).toEqual([]);
  });

  it("actually scans the dashboard sources", () => {
    expect(sourceFiles().length).toBeGreaterThan(15);
  });
});
