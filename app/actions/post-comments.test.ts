import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteComment, updateComment } from "./post-comments";

/*
 * Regression cover for the silent moderation failure.
 *
 * The bug was not in the SQL and not in the policy — it was that the action
 * asked for an authority the database does not grant, and then could not tell
 * that it had been refused:
 *
 *   TS  : ADMIN_PANEL_ROLES = staff | librarian | admin | super_admin
 *   RLS : public.is_admin() = admin | super_admin
 *
 * For a staff or librarian moderator the ownership filter was dropped, the
 * UPDATE matched zero rows, and PostgREST reports zero matched rows as a
 * SUCCESS with an empty body. The action returned {} and the UI hid a comment
 * that was still there for every other reader.
 *
 * So the fake below models the two things that actually produce the bug rather
 * than the code's assumptions about them:
 *   1. RLS decides row visibility BEFORE the .eq() filters are applied.
 *   2. Matching nothing is not an error.
 * A test that mocked the update as "returns { error: null }" would have passed
 * against the broken code.
 */

// Roles public.is_admin() is true for — the real policy, mirrored here.
const SQL_ADMIN_ROLES = ["admin", "super_admin"];

type Row = { id: string; user_id: string; body: string; is_deleted: boolean };

let table: Row[];
let actor: { id: string; role: string } | null;

const mockRevalidate = vi.fn();
vi.mock("@/lib/cache/revalidate", () => ({
  revalidateLocalizedPath: (...args: unknown[]) => mockRevalidate(...args),
}));

/** Rows this actor is allowed to UPDATE, per the post_comments policies. */
function visibleForWrite(): Row[] {
  if (!actor) return [];
  if (SQL_ADMIN_ROLES.includes(actor.role)) return table; // "Admins can manage all comments"
  return table.filter((r) => r.user_id === actor!.id);    // "Users can edit own comment body"
}

function makeClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: actor ? { id: actor.id } : null },
        error: null,
      }),
    },
    from(tableName: string) {
      if (tableName === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: actor ? { role: actor.role } : null,
                error: null,
              }),
            }),
          }),
        };
      }

      if (tableName !== "post_comments") throw new Error(`unexpected table ${tableName}`);

      const filters: Array<[string, string]> = [];
      let patch: Partial<Row> = {};

      const builder = {
        update(next: Partial<Row>) {
          patch = next;
          return builder;
        },
        eq(column: string, value: string) {
          filters.push([column, value]);
          return builder;
        },
        // PostgREST semantics: apply RLS, then the filters, then the patch.
        // Zero matches is an empty body and a null error — never an error.
        select() {
          const matched = visibleForWrite().filter((row) =>
            filters.every(([col, val]) => (row as unknown as Record<string, string>)[col] === val),
          );
          for (const row of matched) Object.assign(row, patch);
          return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeClient(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  table = [{ id: "c1", user_id: "alice", body: "original", is_deleted: false }];
  actor = null;
});

describe("deleteComment — authority must match what RLS will actually allow", () => {
  it("refuses, and says so, when a librarian moderates another reader's comment", async () => {
    actor = { id: "librarian-1", role: "librarian" };

    const res = await deleteComment("c1", "a-post");

    // The defect: this used to return {} and the UI hid the comment.
    expect(res.error).toBeTruthy();
    expect(table[0].is_deleted).toBe(false);
  });

  it("refuses for staff too — the other half of ADMIN_PANEL_ROLES", async () => {
    actor = { id: "staff-1", role: "staff" };

    const res = await deleteComment("c1", "a-post");

    expect(res.error).toBeTruthy();
    expect(table[0].is_deleted).toBe(false);
  });

  it("lets an admin moderate somebody else's comment", async () => {
    actor = { id: "admin-1", role: "admin" };

    const res = await deleteComment("c1", "a-post");

    expect(res.error).toBeUndefined();
    expect(table[0].is_deleted).toBe(true);
  });

  it("lets a reader delete their own comment", async () => {
    actor = { id: "alice", role: "reader" };

    const res = await deleteComment("c1", "a-post");

    expect(res.error).toBeUndefined();
    expect(table[0].is_deleted).toBe(true);
  });

  it("refuses a reader deleting someone else's comment", async () => {
    actor = { id: "bob", role: "reader" };

    const res = await deleteComment("c1", "a-post");

    expect(res.error).toBeTruthy();
    expect(table[0].is_deleted).toBe(false);
  });
});

describe("updateComment — an edit that changed nothing is not a saved edit", () => {
  it("refuses an edit of a comment the user does not own", async () => {
    actor = { id: "bob", role: "reader" };

    const res = await updateComment("c1", "hijacked", "a-post");

    expect(res.error).toBeTruthy();
    expect(table[0].body).toBe("original");
  });

  it("saves the owner's own edit", async () => {
    actor = { id: "alice", role: "reader" };

    const res = await updateComment("c1", "revised", "a-post");

    expect(res.error).toBeUndefined();
    expect(table[0].body).toBe("revised");
  });
});
