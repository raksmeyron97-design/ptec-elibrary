// lib/db/silent-mutation.test.ts
//
// A SOURCE SCAN, like the other invariant tests in this repo. It fails on the
// code it scans, not on a function it calls.
//
// THE RULE: a Server Action mutation whose only authorization is an ownership
// predicate (`.eq("user_id", …)` and friends) must ask what it changed.
// PostgREST answers a predicate that matched nothing with 204 / error:null /
// data:null — identical to success — so without `.select()` the action cannot
// tell "saved" from "that row is not yours", and every caller that trusts it
// tells the reader their change was saved when nothing happened.
//
// Measured against production before this rule existed:
//   UPDATE reading_lists …eq(id,<ghost>).eq(user_id,<ghost>)
//     → error: null · status: 204 · data: null · count: null
//
// Five actions were in this state: deleteAnnotation, updateAnnotationNote,
// updateReadingList, deleteReadingList and updateComment — two of them behind
// the RLS-bypassing service client, where the ownership predicate is the only
// guard there is.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ACTIONS_DIR = join(process.cwd(), "app/actions");

/** `.eq("user_id", …)` — the predicate that IS the authorization check. */
const OWNERSHIP = /\.eq\(\s*["'](user_id|owner_id|admin_id|created_by)["']/;

/**
 * Functions that establish ownership BEFORE the statement runs, so the
 * mutation itself carries no `user_id` predicate and the regex above cannot
 * see it.
 *
 * This blind spot was real, not theoretical: `removeItemFromList` and
 * `updateItemNote` in reading-lists.ts are guarded by `ownedList()` one call
 * earlier, and both were left reporting success for a no-op — one of them
 * discarding its result entirely (`await query;`) — while the five actions the
 * regex did catch were being fixed. An ownership check a line earlier is still
 * an ownership check, and a statement it guards still cannot tell "removed"
 * from "was never there".
 *
 * Matched against the whole FUNCTION rather than the statement, since the
 * guard and the mutation are by definition not on the same line.
 */
const OWNERSHIP_GUARDS = /\b(ownedList|requireOwnedSession|assertOwns\w*)\s*\(/;

/**
 * Statements that may match zero rows as a matter of course, where that is
 * the intended end state rather than a failure. Each is listed with why.
 */
const IDEMPOTENT_BY_DESIGN = [
  // Drafts are deleted on submit whether or not one was ever autosaved.
  "post_drafts",
  "thesis_drafts",
  "publication_drafts",
  "contact_reply_drafts",
  // Un-completing a step the reader never completed is a no-op, not an error.
  "learning_path_step_progress",
  // Enrollment roll-up runs whether or not the reader is enrolled.
  "learning_path_enrollments",
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

/** Every `.update(`/`.delete(` chain in a file, as source text. */
/** The enclosing function's source, so a guard called before the statement is
    visible to the ownership test. Bounded backwards to the nearest
    declaration — a whole file would let any guard vouch for any statement. */
function enclosingFunction(lines: string[], at: number): string {
  let start = at;
  while (start > 0 && !/^(export )?(async )?function |^\s*(const|let) \w+ = (async )?\(/.test(lines[start])) {
    start--;
  }
  return lines.slice(start, at + 1).join("\n");
}

function mutationStatements(src: string): { line: number; text: string; scope: string }[] {
  const lines = src.split("\n");
  const out: { line: number; text: string; scope: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\.(update|delete)\(/.test(lines[i])) continue;
    let start = i;
    while (start > 0 && !/(const|let|await|return)\s/.test(lines[start])) start--;
    let end = i;
    for (let k = i; k < Math.min(i + 16, lines.length); k++) {
      if (lines[k].trimEnd().endsWith(";")) { end = k; break; }
    }
    out.push({
      line: start + 1,
      text: lines.slice(start, end + 1).join("\n"),
      scope: enclosingFunction(lines, start),
    });
  }
  return out;
}

describe("ownership-scoped mutations report what they changed", () => {
  it("no Server Action decides authorization with a predicate it never verifies", () => {
    const offenders: string[] = [];

    for (const file of tsFiles(ACTIONS_DIR)) {
      const src = readFileSync(file, "utf8");
      for (const { line, text, scope } of mutationStatements(src)) {
        // Either the statement carries the ownership predicate, or something
        // earlier in the same function established it.
        if (!OWNERSHIP.test(text) && !OWNERSHIP_GUARDS.test(scope)) continue;
        if (IDEMPOTENT_BY_DESIGN.some((t) => text.includes(`"${t}"`))) continue;
        if (text.includes(".select(")) continue; // it asks — that is the rule
        offenders.push(`${file.replace(process.cwd() + "/", "")}:${line}`);
      }
    }

    expect(
      offenders,
      "These mutations are authorized only by an ownership predicate but never " +
        "check that a row matched, so they report success when the row belongs " +
        "to someone else or is already gone. Add `.select(\"id\")` and pass the " +
        "result through `changedRow()` (lib/db/changed-row.ts). If zero rows is " +
        "genuinely the intended outcome, add the table to IDEMPOTENT_BY_DESIGN " +
        "with a reason.",
    ).toEqual([]);
  });
});
