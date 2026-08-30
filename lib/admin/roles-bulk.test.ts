import { describe, expect, it } from "vitest";
import { ALL_ROLES, type AppRole, type PermLevel } from "@/lib/types/roles";
import {
  ALL_RESOURCE_KEYS,
  applyReferenceRow,
  changesByRole,
  copyRoleLevels,
  diffMatrix,
  countRoleChanges,
  groupLevel,
  groupResourceKeys,
  groupedChanges,
  levelAt,
  previewBulk,
  setLevels,
  toConflictItems,
  type PermMatrix,
} from "@/lib/admin/roles-shared";

// ──────────────────────────────────────────────────────────────────
// The bulk helpers are the whole reason the workspace can offer "copy
// Librarian onto Staff" and "reset to defaults" as one click each. They are
// also the only code that can silently widen access across thirteen
// resources at once, so the rules they encode are pinned here rather than
// left to the dropdown that calls them.
// ──────────────────────────────────────────────────────────────────

function matrixOf(fill: PermLevel): PermMatrix {
  const matrix = {} as PermMatrix;
  for (const role of ALL_ROLES) {
    matrix[role] = Object.fromEntries(ALL_RESOURCE_KEYS.map((key) => [key, fill]));
  }
  return matrix;
}

describe("setLevels", () => {
  it("writes only the named resources of the named role", () => {
    const before = matrixOf("none");
    const keys = groupResourceKeys("library");
    const after = setLevels(before, "staff", keys, "write");

    for (const key of keys) expect(levelAt(after, "staff", key)).toBe("write");
    for (const key of ALL_RESOURCE_KEYS.filter((k) => !keys.includes(k))) {
      expect(levelAt(after, "staff", key)).toBe("none");
    }
    for (const role of ALL_ROLES.filter((r) => r !== "staff")) {
      expect(levelAt(after, role, keys[0])).toBe("none");
    }
  });

  it("returns a new matrix and leaves the original untouched", () => {
    const before = matrixOf("none");
    const after = setLevels(before, "staff", ["books"], "write");
    expect(after).not.toBe(before);
    expect(levelAt(before, "staff", "books")).toBe("none");
  });

  it("refuses to edit super_admin, which is fixed at full access", () => {
    const before = matrixOf("write");
    expect(setLevels(before, "super_admin", ALL_RESOURCE_KEYS, "none")).toBe(before);
  });
});

describe("groupLevel", () => {
  it("reports the shared level when a group agrees", () => {
    const keys = groupResourceKeys("content");
    const matrix = setLevels(matrixOf("none"), "staff", keys, "read");
    expect(groupLevel(matrix, "staff", keys)).toBe("read");
  });

  it("reports 'mixed' as soon as one resource disagrees", () => {
    const keys = groupResourceKeys("content");
    let matrix = setLevels(matrixOf("none"), "staff", keys, "read");
    matrix = setLevels(matrix, "staff", [keys[1]], "write");
    expect(groupLevel(matrix, "staff", keys)).toBe("mixed");
  });
});

describe("copyRoleLevels", () => {
  it("copies every resource, including the ones set to none", () => {
    let source = matrixOf("none");
    source = setLevels(source, "librarian", groupResourceKeys("library"), "write");
    const after = copyRoleLevels(source, "librarian", "staff");

    for (const key of ALL_RESOURCE_KEYS) {
      expect(levelAt(after, "staff", key)).toBe(levelAt(after, "librarian", key));
    }
  });

  it("never writes into super_admin", () => {
    const before = matrixOf("write");
    expect(copyRoleLevels(before, "reader", "super_admin")).toBe(before);
  });
});

describe("applyReferenceRow", () => {
  it("restores a role to the reference row and treats absent keys as no access", () => {
    const reference: Record<string, PermLevel> = { books: "write" };
    const after = applyReferenceRow(matrixOf("read"), "staff", reference);

    expect(levelAt(after, "staff", "books")).toBe("write");
    for (const key of ALL_RESOURCE_KEYS.filter((k) => k !== "books")) {
      expect(levelAt(after, "staff", key)).toBe("none");
    }
    // Untouched roles keep what they had.
    expect(levelAt(after, "librarian", "books")).toBe("read");
  });

  it("is inert without a reference row", () => {
    const before = matrixOf("read");
    expect(applyReferenceRow(before, "staff", undefined)).toBe(before);
  });
});

describe("changesByRole", () => {
  it("buckets in role order and omits roles with nothing pending", () => {
    const baseline = matrixOf("none");
    let draft = setLevels(baseline, "admin", ["books"], "write");
    draft = setLevels(draft, "staff", ["posts", "catalog"], "read");

    const buckets = changesByRole(diffMatrix(baseline, draft, ALL_ROLES), ALL_ROLES);
    expect(buckets.map((b) => b.role)).toEqual<AppRole[]>(["staff", "admin"]);
    expect(buckets[0].changes).toHaveLength(2);
    expect(buckets[1].changes).toHaveLength(1);
  });
});

describe("toConflictItems", () => {
  it("keeps what the editor started from, what they set, and what the DB holds", () => {
    // The editor loaded `read`, set `write`; the server reports the row is now
    // `none` because someone else saved in between.
    const baseline = setLevels(matrixOf("none"), "staff", ["books"], "read");
    const [item] = toConflictItems(
      [{ role: "staff", resource: "books", from: "none", to: "write" }],
      baseline,
    );

    expect(item).toEqual({ role: "staff", resource: "books", was: "read", mine: "write", theirs: "none" });
  });
});

describe("conflict resolution folds back into a saveable diff", () => {
  // This mirrors saveAfterConflicts() in RolesWorkspace: every conflicted cell's
  // baseline moves to the database's value, and "take theirs" moves the draft
  // there too. The retry must then carry a `from` the server will accept.
  it("drops a 'take theirs' change and re-bases a 'keep mine' one", () => {
    const baseline = setLevels(matrixOf("none"), "staff", ["books", "posts"], "read");
    let draft = setLevels(baseline, "staff", ["books"], "write");
    draft = setLevels(draft, "staff", ["posts"], "write");

    const items = toConflictItems(
      [
        { role: "staff", resource: "books", from: "none", to: "write" },
        { role: "staff", resource: "posts", from: "write", to: "write" },
      ],
      baseline,
    );

    let nextBaseline = baseline;
    let nextDraft = draft;
    const choice: Record<string, "mine" | "theirs"> = { books: "mine", posts: "theirs" };
    for (const item of items) {
      nextBaseline = setLevels(nextBaseline, item.role, [item.resource], item.theirs);
      if (choice[item.resource] === "theirs") {
        nextDraft = setLevels(nextDraft, item.role, [item.resource], item.theirs);
      }
    }

    const retry = diffMatrix(nextBaseline, nextDraft, ALL_ROLES);
    expect(retry).toEqual([{ role: "staff", resource: "books", from: "none", to: "write" }]);
  });
});

describe("previewBulk + countRoleChanges", () => {
  // The confirmation dialog's number comes from these two, and an over- or
  // under-count is worse than no number at all: it is the only thing standing
  // between "copy Admin onto Staff" and thirteen silent grants.
  const defaults = {
    reader: Object.fromEntries(ALL_RESOURCE_KEYS.map((k) => [k, "read" as PermLevel])),
    staff: Object.fromEntries(ALL_RESOURCE_KEYS.map((k) => [k, "read" as PermLevel])),
    librarian: {},
    admin: {},
    super_admin: {},
  } as Record<AppRole, Record<string, PermLevel>>;

  it("counts only the cells a copy would actually move", () => {
    let matrix = matrixOf("none");
    matrix = setLevels(matrix, "librarian", groupResourceKeys("library"), "write");
    // Staff already matches on the two library resources, differs nowhere else
    // because everything is "none" on both sides.
    matrix = setLevels(matrix, "staff", groupResourceKeys("library"), "write");

    const next = previewBulk(matrix, "staff", { kind: "copy", source: "librarian" }, defaults);
    expect(countRoleChanges(matrix, next, "staff")).toBe(0);
  });

  it("counts a reset against the reference row, not against zero", () => {
    const matrix = matrixOf("none");
    const next = previewBulk(matrix, "staff", { kind: "defaults" }, defaults);
    // Every resource moves none → read.
    expect(countRoleChanges(matrix, next, "staff")).toBe(ALL_RESOURCE_KEYS.length);
  });

  it("counts a clear as everything currently non-none", () => {
    let matrix = matrixOf("none");
    matrix = setLevels(matrix, "admin", ["books", "posts", "users"], "write");
    const next = previewBulk(matrix, "admin", { kind: "clear" }, defaults);
    expect(countRoleChanges(matrix, next, "admin")).toBe(3);
  });

  it("never previews a change to the locked role", () => {
    const matrix = matrixOf("write");
    const next = previewBulk(matrix, "super_admin", { kind: "clear" }, defaults);
    expect(countRoleChanges(matrix, next, "super_admin")).toBe(0);
    expect(next).toBe(matrix);
  });

  it("leaves every other role untouched", () => {
    const matrix = matrixOf("read");
    const next = previewBulk(matrix, "staff", { kind: "clear" }, defaults);
    for (const role of ALL_ROLES.filter((r) => r !== "staff")) {
      expect(countRoleChanges(matrix, next, role)).toBe(0);
    }
  });
});

describe("groupedChanges", () => {
  it("nests role → category → change, in catalogue order, skipping empties", () => {
    const baseline = matrixOf("none");
    let draft = setLevels(baseline, "staff", ["users"], "read"); // Administration
    draft = setLevels(draft, "staff", ["books"], "write"); // Library

    const [bucket] = groupedChanges(diffMatrix(baseline, draft, ALL_ROLES), ALL_ROLES);
    expect(bucket.role).toBe("staff");
    expect(bucket.groups.map((g) => g.id)).toEqual(["library", "administration"]);
    expect(bucket.groups[0].changes[0].resource).toBe("books");
    expect(bucket.groups[1].changes[0].resource).toBe("users");
  });
});
