import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ──────────────────────────────────────────────────────────────────
// Every public error boundary offers a recovery that actually recovers.
//
// Found on 2026-09-14: eleven of fourteen app/[locale]/(public)/**/error.tsx
// files drew a "Try again" button with no onClick — the one action on the
// page did nothing — and the three that were wired called `reset`, which in
// Next 16.3 re-renders the same failed server payload without refetching
// (`retry` refreshes first; node_modules/next/dist/docs/01-app/03-api-
// reference/03-file-conventions/error.md). A dead button renders exactly
// like a live one, so nothing but a source scan notices.
// ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "app", "[locale]", "(public)");
// Code only: the file's own comments explain why `reset()` is wrong, and a
// negative assertion must not trip on the explanation.
const RECOVERY = fs
  .readFileSync(path.join(ROOT, "components", "ui", "core", "ErrorRecovery.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function errorBoundaries(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return errorBoundaries(full);
    return entry.name === "error.tsx" ? [full] : [];
  });
}

describe("public error boundaries", () => {
  const files = errorBoundaries(PUBLIC);

  it("exist (the scan found the tree)", () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
  });

  it("all render the one shared ErrorRecovery state", () => {
    const private_ = files
      .filter((f) => !/import ErrorRecovery\b[^;]*from "@\/components\/ui\/core\/ErrorRecovery"/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(private_).toEqual([]);
  });

  it("pass Next's props straight through, so retry reaches the button", () => {
    for (const f of files) {
      expect(fs.readFileSync(f, "utf8"), path.relative(ROOT, f)).toMatch(/<ErrorRecovery \{\.\.\.props\}/);
    }
  });
});

describe("ErrorRecovery", () => {
  it("wires Try again to retry(), not reset()", () => {
    expect(RECOVERY).toMatch(/onClick=\{\(\) => startTransition\(\(\) => retry\(\)\)\}/);
    expect(RECOVERY).not.toMatch(/\breset\(\)/);
  });

  it("never shows the raw error to a reader", () => {
    expect(RECOVERY).not.toMatch(/\{\s*error\.message/);
  });

  it("is localised (no hard-coded English sentence in the markup)", () => {
    expect(RECOVERY).toMatch(/useTranslations\("errors"\)/);
    expect(RECOVERY).not.toMatch(/>\s*(Try again|Something went wrong|Go home)\s*</);
  });
});
