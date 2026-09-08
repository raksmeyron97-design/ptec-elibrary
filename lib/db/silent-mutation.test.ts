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
function mutationStatements(src: string): { line: number; text: string }[] {
  const lines = src.split("\n");
  const out: { line: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\.(update|delete)\(/.test(lines[i])) continue;
    let start = i;
    while (start > 0 && !/(const|let|await|return)\s/.test(lines[start])) start--;
    let end = i;
    for (let k = i; k < Math.min(i + 16, lines.length); k++) {
      if (lines[k].trimEnd().endsWith(";")) { end = k; break; }
    }
    out.push({ line: start + 1, text: lines.slice(start, end + 1).join("\n") });
  }
  return out;
}

describe("ownership-scoped mutations report what they changed", () => {
  it("no Server Action decides authorization with a predicate it never verifies", () => {
    const offenders: string[] = [];

    for (const file of tsFiles(ACTIONS_DIR)) {
      const src = readFileSync(file, "utf8");
      for (const { line, text } of mutationStatements(src)) {
        if (!OWNERSHIP.test(text)) continue;
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
