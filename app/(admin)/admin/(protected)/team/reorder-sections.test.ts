import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reordering sections must survive a TIE, because ties are the normal state.
 *
 * `reorderTeamSection` used to swap the two rows' `display_order` VALUES. When
 * the neighbours already shared a value — which they do out of the box, since
 * the baseline migration seeds six sections numbered 1-6 and `seed.sql` adds
 * two more starting again at 1 — the swap wrote `1 → 1` and `1 → 1`. Nothing
 * changed in the database, nothing errored, and the optimistic client showed
 * the move as saved. Reproduced against a real stack: the tied pair did not
 * move, while a pair with distinct orders did, which is why the arrows looked
 * like they worked.
 *
 * So the rule is: a reorder RENUMBERS the list to 1..n. That moves the row
 * whatever the neighbours' values were, and removes the ties permanently
 * instead of preserving them. `display_order` carries no unique constraint, so
 * there is nothing to collide with as the rows are rewritten.
 */

const mockRequireAdmin = vi.fn();
const mockLogAdminAction = vi.fn();

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: () => mockRequireAdmin() }));
vi.mock("@/app/actions/audit", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));
vi.mock("@/lib/cache/revalidate", () => ({ revalidateLocalizedPath: vi.fn() }));
vi.mock("@/lib/team/photo", () => ({ isAllowedTeamPhotoUrl: () => true }));

type Row = { id: string; display_order: number; name_en: string };

/** Rows as they stand in the fake database, plus every write applied to them. */
let rows: Row[] = [];
let readError: string | null = null;
/** Ids whose UPDATE should report "matched nothing", as PostgREST does. */
let vanished = new Set<string>();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => {
        // `.order(...).order(...)` then awaited.
        const result = {
          order: () => result,
          then: (resolve: (v: unknown) => void) =>
            resolve(
              readError
                ? { data: null, error: { message: readError } }
                : {
                    data: [...rows].sort(
                      (a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id),
                    ),
                    error: null,
                  },
            ),
        };
        return result;
      },
      update: (patch: { display_order: number }) => ({
        eq: (_col: string, id: string) => ({
          // `.select("id")` — the call that makes a no-match distinguishable.
          select: async () => {
            if (vanished.has(id)) return { data: [], error: null };
            const row = rows.find((r) => r.id === id);
            if (!row) return { data: [], error: null };
            row.display_order = patch.display_order;
            return { data: [{ id }], error: null };
          },
        }),
      }),
    }),
  }),
}));

const { reorderTeamSection } = await import("./actions");

/** Names in the order a reader would see them. */
function displayed() {
  return [...rows]
    .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id))
    .map((r) => r.name_en);
}

function orders() {
  return [...rows]
    .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id))
    .map((r) => r.display_order);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ userId: "admin-user-id" });
  readError = null;
  vanished = new Set();
  // Production's actual shape: two rows at 1, two at 2, then 3..6.
  rows = [
    { id: "a", display_order: 1, name_en: "General Management" },
    { id: "b", display_order: 1, name_en: "Library Leadership" },
    { id: "c", display_order: 2, name_en: "Administration" },
    { id: "d", display_order: 2, name_en: "Library Staff" },
    { id: "e", display_order: 3, name_en: "E-Library" },
  ];
});

describe("reorderTeamSection", () => {
  it("moves a row whose neighbour shares its display_order", async () => {
    expect(displayed()[0]).toBe("General Management");

    const result = await reorderTeamSection("b", "up");

    expect(result).toEqual({ success: true });
    expect(displayed()[0], "the tied pair must actually swap").toBe("Library Leadership");
    expect(displayed()[1]).toBe("General Management");
  });

  it("renumbers to a gapless 1..n, leaving no ties behind", async () => {
    await reorderTeamSection("b", "up");
    expect(orders()).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(orders()).size, "every row holds a distinct position").toBe(rows.length);
  });

  it("moves down as well as up", async () => {
    await reorderTeamSection("a", "down");
    expect(displayed().slice(0, 2)).toEqual(["Library Leadership", "General Management"]);
  });

  it("is a no-op at the edges rather than an error", async () => {
    const top = await reorderTeamSection("a", "up");
    const bottom = await reorderTeamSection("e", "down");
    expect(top).toEqual({ success: true });
    expect(bottom).toEqual({ success: true });
    expect(displayed()).toEqual([
      "General Management",
      "Library Leadership",
      "Administration",
      "Library Staff",
      "E-Library",
    ]);
  });

  it("records the move in the audit log", async () => {
    await reorderTeamSection("b", "up");
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      "admin-user-id",
      "team_section.reorder",
      "team_sections",
      "b",
      expect.objectContaining({ direction: "up", from: 2, to: 1 }),
    );
  });

  it("reports a write that matched no row instead of claiming success", async () => {
    // A PostgREST update whose predicate matches nothing answers exactly like
    // one that succeeded, unless it is asked for its rows. This is the case
    // the old implementation could not see at all.
    vanished.add("a");
    const result = await reorderTeamSection("b", "up");
    expect(result).toEqual({ error: "A section changed while reordering. Reload and try again." });
    expect(mockLogAdminAction, "a failed reorder is not audited as a move").not.toHaveBeenCalled();
  });

  it("reports an unknown section instead of silently doing nothing", async () => {
    expect(await reorderTeamSection("missing", "up")).toEqual({
      error: "That section no longer exists.",
    });
  });

  it("surfaces a failed read", async () => {
    readError = "connection reset";
    const result = await reorderTeamSection("b", "up");
    expect("error" in result && result.error).toBeTruthy();
    expect(displayed()[0], "nothing is written when the list could not be read").toBe(
      "General Management",
    );
  });

  it("refuses when the caller is not an admin", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("Unauthorized"));
    const result = await reorderTeamSection("b", "up");
    expect("error" in result).toBe(true);
    expect(orders(), "an unauthorized call writes nothing").toEqual([1, 1, 2, 2, 3]);
  });
});
