import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// ──────────────────────────────────────────────────────────────────
// No public text field may be smaller than 16px on a phone.
//
// iOS Safari zooms the whole page into any <input>, <select> or <textarea>
// whose text is under 16px the moment it takes focus, and leaves it zoomed:
// the reader lands mid-page, sideways, and has to pinch back out. It happened
// on the search box, the homepage hero, the assistant, review and note
// fields, the book-request form and every listing's sort select — 17 fields
// (docs/MOBILE-GLASS-UI.md). The fix is always the same: `text-base` for
// phones, the original size from `sm:` up.
//
// A source scan, so it reads classNames written as string or template
// literals. A className built in a variable is not seen — keep field classes
// inline.
// ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");

// Imported by nothing (CLAUDE.md: "the next thing to delete").
const EXEMPT = new Set(["components/ui/chat/FloatingChat.tsx"]);

function publicComponentFiles(): string[] {
  const list = (args: string[]) =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  // ls-files alone misses a file nobody has `git add`ed yet.
  const files = [
    ...list(["ls-files", "components", "app/[locale]"]),
    ...list(["ls-files", "--others", "--exclude-standard", "components", "app/[locale]"]),
  ];
  return [...new Set(files)].filter(
    (f) => f.endsWith(".tsx") && !f.includes(".test.") && !f.includes("/admin") && !EXEMPT.has(f),
  );
}

// A size that applies on phones: not prefixed by a breakpoint.
const SMALL = /^(text-xs|text-sm|text-\[(?:1[0-5]|[0-9])(?:\.\d+)?px\])$/;

function smallFields(src: string): string[] {
  const found: string[] = [];
  const field = /<(input|select|textarea)\b([\s\S]*?)(\/?>)/g;
  let m: RegExpExecArray | null;
  while ((m = field.exec(src))) {
    const attrs = m[2];
    if (/type=["'](checkbox|radio|range|file|hidden|submit|button|color)["']/.test(attrs)) continue;
    const cls = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/.exec(attrs);
    if (!cls) continue;
    const tokens = (cls[1] ?? cls[2] ?? cls[3]).split(/\s+/);
    const phoneTokens = tokens.filter((t) => SMALL.test(t));
    if (phoneTokens.length) {
      const line = src.slice(0, m.index).split("\n").length;
      found.push(`line ${line} <${m[1]}> ${phoneTokens.join(" ")}`);
    }
  }
  return found;
}

describe("mobile form fields", () => {
  it("never render text under 16px on a phone (iOS focus-zoom)", () => {
    const offenders: string[] = [];
    for (const file of publicComponentFiles()) {
      const full = path.join(ROOT, file);
      if (!fs.existsSync(full)) continue;
      for (const hit of smallFields(fs.readFileSync(full, "utf8"))) offenders.push(`${file} ${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  it("recognises the shapes it guards (negative control)", () => {
    expect(smallFields(`<input className="h-9 text-[15px]" />`)).toHaveLength(1);
    expect(smallFields(`<select className={\`px-3 text-sm\`}>`)).toHaveLength(1);
    expect(smallFields(`<textarea className="p-4 text-xs" />`)).toHaveLength(1);
    // The fix, and the exemptions, pass.
    expect(smallFields(`<input className="text-base sm:text-[15px]" />`)).toEqual([]);
    expect(smallFields(`<input type="checkbox" className="h-3.5 text-sm" />`)).toEqual([]);
  });
});
