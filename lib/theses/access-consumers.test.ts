import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Every surface that decides whether a reader may READ or DOWNLOAD a thesis
// asks lib/theses/access.ts — the projection of the one download engine.
//
// This exists because the record page once decided for itself: it drew a
// solid "Preview PDF" for any record with a `file_url`, and the reader it
// opened asked /api/theses/[id]/file for the bytes, which answered 403 for
// every Top-10 and admin-blocked thesis. The unit tests in access.test.ts
// prove the projection agrees with the routes; this file proves the surfaces
// actually use it.

const ROOT = path.join(__dirname, "..", "..");

/** Source with comments stripped, so prose that NAMES a rule cannot satisfy
 *  or trip the check that enforces it. */
function code(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const FILE_ROUTE = "app/api/theses/[id]/file/route.ts";
const STATUS_ROUTE = "app/api/theses/[id]/download-status/route.ts";
const PAGE = "app/[locale]/(public)/theses/[slug]/page.tsx";
const ACTIONS = "components/ui/theses/detail/ThesisActions.tsx";
const FULL_TEXT = "components/ui/theses/detail/FullTextSection.tsx";

describe("thesis access has one decision-maker", () => {
  it.each([FILE_ROUTE, STATUS_ROUTE, PAGE])("%s resolves access through resolveThesisAccess()", (rel) => {
    expect(code(rel)).toMatch(/\bresolveThesisAccess\s*\(/);
  });

  it("the file route refuses on the projection's states, not on its own reading of the decision", () => {
    const src = code(FILE_ROUTE);
    expect(src).toMatch(/access\.state\s*===\s*["']unavailable["']/);
    expect(src).toMatch(/access\.state\s*===\s*["']protected["']/);
    expect(src).not.toMatch(/decision\.effectivePolicy\s*===\s*["']blocked["']/);
  });

  it("the status route tells the client what it may READ, not only what it may download", () => {
    const src = code(STATUS_ROUTE);
    expect(src).toMatch(/canRead\s*:\s*access\.canRead/);
    expect(src).toMatch(/state\s*:\s*access\.state/);
  });

  it("the record page hands the same access object to both read surfaces", () => {
    const src = code(PAGE);
    expect(src).toMatch(/<ThesisPrimaryActions[\s\S]*?access=\{access\}/);
    expect(src).toMatch(/<FullTextSection[\s\S]*?access=\{access\}/);
  });

  it("the preview button is drawn from access.canRead, never from a file's existence", () => {
    const src = code(ACTIONS);
    expect(src).toMatch(/access\.canRead\s*&&/);
    // The old prop that made "has a file" mean "may read".
    expect(src).not.toMatch(/\bhasFile\b/);
    // Only ThesisActions opens the reader, and only behind that gate.
    expect(src.match(/openThesisReader\s*\(/g)?.length).toBe(1);
  });

  it("the in-page reader mounts only for a reader the file route will serve", () => {
    const src = code(FULL_TEXT);
    expect(src).toMatch(/if\s*\(\s*!canRead\s*\)\s*return/);
    expect(src).toMatch(/const canRead\s*=\s*access\.canRead/);
    // The old gate: signed in was treated as allowed to read.
    expect(src).not.toMatch(/\bisLoggedIn\b/);
  });

  it("no other thesis surface opens the reader", () => {
    const dirs = ["components/ui/theses", "app/[locale]/(public)/theses"];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
        const rel = path.relative(ROOT, path.join(entry.parentPath ?? dir, entry.name)).replace(/\\/g, "/");
        if (rel === ACTIONS) continue;
        if (/openThesisReader\s*\(/.test(code(rel))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
