// The dismissal key, and the rules that stop "not a duplicate" from becoming
// "never look at these again".
//
// A dismissal is the only thing on /admin/books/duplicates that HIDES records
// from every other reviewer, so what it is keyed on decides whether it can go
// stale silently. These pin that the key is the group's membership and nothing
// else, and that the action layer treats the write and the undo asymmetrically.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { duplicateGroupFingerprint } from "./duplicate-dismissal";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("duplicateGroupFingerprint", () => {
  it("does not depend on the order the detector emitted the group", () => {
    expect(duplicateGroupFingerprint([A, B, C])).toBe(duplicateGroupFingerprint([C, A, B]));
  });

  it("CHANGES when a record joins the group", () => {
    // The whole point. A dismissal says "I reviewed these N records"; a group
    // with a new member in it is a new question and must come back, rather than
    // inheriting a verdict nobody gave about it.
    expect(duplicateGroupFingerprint([A, B])).not.toBe(duplicateGroupFingerprint([A, B, C]));
  });

  it("CHANGES when a record leaves the group", () => {
    expect(duplicateGroupFingerprint([A, B, C])).not.toBe(duplicateGroupFingerprint([A, B]));
  });

  it("is case- and whitespace-insensitive on the ids", () => {
    expect(duplicateGroupFingerprint([` ${A.toUpperCase()} `, B])).toBe(duplicateGroupFingerprint([A, B]));
  });

  it("is a 64-character hex digest, which is what the action and column accept", () => {
    expect(duplicateGroupFingerprint([A, B])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the dismissal actions", () => {
  const source = readFileSync("app/actions/duplicates.ts", "utf8");

  it("derives the fingerprint server-side instead of accepting the client's", () => {
    // A derived value taken from a caller is a value the caller chose. The
    // write must re-derive it from the ids; only the UNDO may be keyed on a
    // fingerprint, because there it is the row's own primary key and the worst
    // a wrong one can do is fail to delete.
    const dismissBody = source.slice(source.indexOf("export async function dismissDuplicateGroup"));
    expect(dismissBody).toContain("duplicateGroupFingerprint(bookIds)");
    expect(dismissBody.slice(0, dismissBody.indexOf("export async function restoreDuplicateGroup"))).not.toMatch(
      /input\.fingerprint/,
    );
  });

  it("guards both edges on books:write before opening a service client", () => {
    for (const fn of ["dismissDuplicateGroup", "restoreDuplicateGroup"]) {
      const body = source.slice(source.indexOf(`export async function ${fn}`));
      expect(body.slice(0, body.indexOf("supabase"))).toContain('requirePermission("books", "write")');
    }
  });

  it("asks the delete for its rows rather than reporting a no-op as an undo", () => {
    // A delete that matched nothing has still reached the requested state, but
    // the audit row must not claim a restore that never happened.
    const body = source.slice(source.indexOf("export async function restoreDuplicateGroup"));
    expect(body).toMatch(/\.delete\(\)[\s\S]*\.select\(/);
    expect(body).toContain("removed.length === 0");
  });

  it("writes an audit row for the dismissal AND for the undo", () => {
    expect(source).toContain('"book.duplicate_group_dismissed"');
    expect(source).toContain('"book.duplicate_group_restored"');
  });

  it("never touches a book's status, slug or visibility", () => {
    // Dismissing is a memo about the queue. The moment it starts writing to
    // `books` it has become a second, unaudited archive path.
    const dismissBody = source.slice(source.indexOf("// ── \"These are not duplicates\""));
    expect(dismissBody).not.toMatch(/from\("books"\)[\s\S]{0,200}\.update\(/);
    expect(dismissBody).not.toContain("book_slug_redirects");
  });

  it("leaves the public cache alone — no book changed", () => {
    const dismissBody = source.slice(source.indexOf("// ── \"These are not duplicates\""));
    expect(dismissBody).toContain("revalidatePath(EBOOKS_DUPLICATES_PATH)");
    expect(dismissBody).not.toContain("REVALIDATE_PATHS");
    expect(dismissBody).not.toContain("revalidateBookSlugChange");
  });
});

describe("the dismissals table", () => {
  const migration = readFileSync("supabase/migrations/0153_duplicate_dismissals.sql", "utf8");

  it("is closed to the API roles, like every other service-role-only table", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toMatch(/revoke all on public\.duplicate_dismissals from public, anon, authenticated/);
    expect(migration).toMatch(/grant all on public\.duplicate_dismissals to service_role/);
  });

  it("refuses a 'group' of fewer than two records", () => {
    expect(migration).toMatch(/array_length\(book_ids, 1\) >= 2/);
  });
});
