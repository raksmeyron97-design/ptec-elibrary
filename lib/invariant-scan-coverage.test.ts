// lib/invariant-scan-coverage.test.ts
//
// THE SCANS MUST BE ABLE TO SEE A NEW FILE.
//
// About thirty invariant tests in this repository enforce architecture by
// scanning source rather than by calling a function (CLAUDE.md lists them).
// Most reach for the filesystem through git, and git's default is to answer
// about TRACKED files only.
//
// That default made every one of those scans blind to a file that had just
// been created. On 2026-09-12 a new `lib/seo/contributor.ts` carried the
// institution's name — exactly what lib/settings-consistency.test.ts forbids —
// through FOUR clean local suites, `tsc`, `lint` and a clean production build.
// CI caught it on the first run after the commit made the file tracked. The
// local runs were not flaky: the scan genuinely could not see the file.
//
// A scan that cannot see new code is worse than no scan, because it reports
// success. This test keeps every git-backed scan able to see untracked files,
// and fails when a new one forgets.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SELF = "lib/invariant-scan-coverage.test.ts";

/** Every tracked-or-untracked test file, so this scan can see a new scan. */
function testFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "*.test.ts", "*.test.tsx"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean).filter((f) => f !== SELF);
}

describe("git-backed source scans can see untracked files", () => {
  it("every `git grep` invariant scan passes --untracked", () => {
    const offenders = testFiles().filter((file) => {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      // Only the array form this repo uses; a plain string command is not one.
      const calls = src.match(/\[\s*"grep"[^\]]*\]/g) ?? [];
      return calls.some((call) => !call.includes('"--untracked"'));
    });

    expect(
      offenders,
      'These tests scan with `git grep` but omit "--untracked", so they cannot ' +
        "see a source file that has not been committed yet — the scan reports " +
        "success on code it never read. Add \"--untracked\" (it still honours " +
        ".gitignore).",
    ).toEqual([]);
  });

  it("every `git ls-files` inventory includes untracked, non-ignored files", () => {
    const offenders = testFiles().filter((file) => {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      const calls = src.match(/\[\s*"ls-files"[^\]]*\]/g) ?? [];
      return calls.some(
        (call) => !(call.includes('"--others"') && call.includes('"--exclude-standard"')),
      );
    });

    expect(
      offenders,
      'These tests inventory files with `git ls-files` but omit "--others" ' +
        '/ "--exclude-standard", so a newly created file is missing from the ' +
        "inventory they check.",
    ).toEqual([]);
  });
});
