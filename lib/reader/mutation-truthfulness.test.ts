import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A SOURCE SCAN, not a behavioural test, and deliberately so.
 *
 * PostgREST does not treat a statement that matches no rows as an error. A
 * delete or update scoped `.eq("user_id", user.id)` against somebody else's id
 * — or against a row a second tab already removed — succeeds, having changed
 * nothing. So `{ success: !error }` reports "done" for a request that did
 * nothing at all, and the client then updates its own state to match a
 * database that never moved: an annotation vanishes from the panel and is
 * still stored; a source disappears from a collection and comes back on the
 * next visit; a note reads as saved and is nowhere.
 *
 * The defect is invisible to a unit test with a mocked client, because the
 * mock returns whatever it was told to, and invisible to a type check, because
 * `{ success: boolean }` is a perfectly good type for a wrong answer. What
 * makes it detectable is the SHAPE of the call: a mutation that never asks for
 * its affected rows back cannot know whether it changed anything.
 *
 * The rule this file enforces is therefore narrow and mechanical — every
 * `.delete()` or `.update()` in the user-owned reading surfaces is followed by
 * a `.select(...)`, so its result can be counted. What the caller then DOES
 * with a zero count is a judgement the individual action makes and documents
 * (a delete that finds nothing has still reached the requested state; an
 * update that finds nothing has not), and is covered by those actions' own
 * comments rather than by this scan.
 */

const FILES = [
  "app/actions/book-annotations.ts",
  "app/actions/reader-bookmarks.ts",
  "app/actions/reading-lists.ts",
];

const repoRoot = path.resolve(__dirname, "..", "..");

/** Comments are stripped before anything is matched: these files DOCUMENT the
    anti-pattern they avoid, and a scan that reads prose as code would fail on
    the explanation of the very rule it enforces. Statements are then collapsed
    onto one line, so a `.select()` written on the next line still reads as
    part of the same chained call. */
function collapse(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/\s+/g, " ");
}

/** Split a module into its exported functions, keyed by name. The check is
    per FUNCTION rather than per chained statement because a mutation is
    sometimes built in stages — `removeItemFromList` applies one of two page
    filters before executing — and the `.select()` that counts its rows then
    lands on a different line from the `.delete()`. What matters is that the
    function asks for its affected rows somewhere before it answers, not the
    syntax it uses to do so. */
function exportedFunctions(collapsed: string): { name: string; body: string }[] {
  const parts = collapsed.split(/export async function /).slice(1);
  return parts.map((part) => ({
    name: part.slice(0, part.indexOf("(")).trim(),
    body: part,
  }));
}

const MUTATIONS = [".delete()", ".update("];

describe("user-owned mutations report what actually changed", () => {
  it.each(FILES)("%s asks every delete/update for its affected rows", (file) => {
    const collapsed = collapse(readFileSync(path.join(repoRoot, file), "utf8"));
    const fns = exportedFunctions(collapsed);

    // A guard on the guard: if these files are restructured so no mutation is
    // found, the test must fail rather than silently pass on an empty set.
    const mutating = fns.filter((fn) => MUTATIONS.some((m) => fn.body.includes(m)));
    expect(mutating.length).toBeGreaterThan(0);

    for (const fn of mutating) {
      expect(
        fn.body.includes(".select("),
        `${file}: ${fn.name}() mutates without asking for its affected rows, ` +
          `so it cannot tell a real change from a no-op against a row that is ` +
          `not the caller's, or is already gone.`,
      ).toBe(true);
    }
  });

  it("no reading-surface action reports success straight off the error flag", () => {
    // `{ success: !error }` is the exact shape that produced this bug in
    // deleteAnnotation and updateAnnotationNote. It is never correct on a
    // statement whose row count is the thing being reported.
    for (const file of FILES) {
      const source = readFileSync(path.join(repoRoot, file), "utf8");
      expect(
        collapse(source).includes("success: !error"),
        `${file} reports success from the error flag alone, which is true for ` +
          `a statement that matched no rows.`,
      ).toBe(false);
    }
  });
});
