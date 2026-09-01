import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermChange } from "@/lib/admin/roles-shared";

// ──────────────────────────────────────────────────────────────────
// saveRolePermissions is the only write path to the authorization table,
// so the checks it performs ARE the security boundary — the workspace's
// locked columns and disabled controls are UX, not enforcement. These
// tests drive the action directly, the way a forged request would.
// ──────────────────────────────────────────────────────────────────

const requireAction = vi.fn();
const resolveAdminPermissions = vi.fn();
const logAdminAction = vi.fn();
const revalidateLocalizedPath = vi.fn();

vi.mock("@/lib/admin/route-guard", () => ({
  requireAction: (...args: unknown[]) => requireAction(...args),
}));
vi.mock("@/lib/auth/requireAdmin", () => ({
  resolveAdminPermissions: () => resolveAdminPermissions(),
}));
vi.mock("@/app/actions/audit", () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
}));
vi.mock("@/lib/cache/revalidate", () => ({
  revalidateLocalizedPath: (...args: unknown[]) => revalidateLocalizedPath(...args),
}));

const { saveRolePermissions } = await import("./actions");

/** Minimal stand-in for the PostgREST builder the action uses. */
function fakeSupabase({
  rows = [] as { role: string; resource: string; level: string }[],
  readError = null as { message: string } | null,
  writeError = null as { message: string } | null,
} = {}) {
  const upserted: { rows: unknown; options: unknown }[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("role_permissions");
      return {
        select: () => ({ in: async () => ({ data: rows, error: readError }) }),
        upsert: async (payload: unknown, options: unknown) => {
          upserted.push({ rows: payload, options });
          return { error: writeError };
        },
      };
    },
  };
  return { client, upserted };
}

/**
 * Arrange the action's two dependencies: the guard that admits the caller, and
 * the identity lookup the delegation rules read. `asSuperAdmin` defaults to
 * true because that is who edited this matrix before it became delegable —
 * every pre-existing test below then describes unchanged behaviour.
 */
function useSupabase(
  config?: Parameters<typeof fakeSupabase>[0],
  { asSuperAdmin = true }: { asSuperAdmin?: boolean } = {},
) {
  const { client, upserted } = fakeSupabase(config);
  requireAction.mockResolvedValue({ supabase: client, user: { id: "admin-uuid" } });
  resolveAdminPermissions.mockResolvedValue({
    role: asSuperAdmin ? "super_admin" : "admin",
    isSuperAdmin: asSuperAdmin,
    perms: { roles: "write" },
  });
  return upserted;
}

const change = (over: Partial<PermChange> = {}): PermChange => ({
  role: "staff",
  resource: "books",
  from: "read",
  to: "write",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authorization", () => {
  it("runs the registry guard, by policy id, before touching anything", async () => {
    useSupabase();
    await saveRolePermissions([change()]);
    expect(requireAction).toHaveBeenCalledTimes(1);
    // Same id the page declares, so the editor and the save cannot drift apart.
    expect(requireAction).toHaveBeenCalledWith("roles.save");
  });

  it("propagates a guard rejection instead of writing", async () => {
    const upserted = useSupabase();
    requireAction.mockRejectedValue(new Error("Forbidden"));
    await expect(saveRolePermissions([change()])).rejects.toThrow("Forbidden");
    expect(upserted).toHaveLength(0);
  });
});

describe("delegation rules", () => {
  // `roles: write` is the one grant that can grant grants. The permission level
  // says whether someone may edit the matrix; these say whether a given edit may
  // widen who else can. See ROLES_DELEGATION_RULES in lib/admin/access-policy.ts.

  it("lets a delegated admin administer ordinary permissions", async () => {
    const upserted = useSupabase({}, { asSuperAdmin: false });
    const res = await saveRolePermissions([change({ resource: "books" })]);
    expect(res.status).toBe("ok");
    expect(upserted).toHaveLength(1);
  });

  it("refuses to let a delegated admin appoint another administrator", async () => {
    const upserted = useSupabase({}, { asSuperAdmin: false });
    const res = await saveRolePermissions([
      change({ role: "staff", resource: "roles", from: "none", to: "write" }),
    ]);
    expect(res.status).toBe("error");
    expect(upserted).toHaveLength(0);
  });

  it("refuses to let a delegated admin revoke role management — including their own", async () => {
    // The same rule that stops the trust boundary widening also makes
    // self-lockout impossible: an admin cannot take `roles` away from `admin`.
    const upserted = useSupabase({}, { asSuperAdmin: false });
    const res = await saveRolePermissions([
      change({ role: "admin", resource: "roles", from: "write", to: "none" }),
    ]);
    expect(res.status).toBe("error");
    expect(upserted).toHaveLength(0);
  });

  it("rejects the whole batch when one cell touches the roles row", async () => {
    // A bulk action ("copy Admin onto Staff") reaches the roles row through a
    // different path than the segmented control, and must be refused too.
    const upserted = useSupabase({}, { asSuperAdmin: false });
    const res = await saveRolePermissions([
      change({ resource: "books" }),
      change({ role: "staff", resource: "roles", from: "none", to: "write" }),
    ]);
    expect(res.status).toBe("error");
    expect(upserted).toHaveLength(0);
  });

  it("lets a super admin move the roles row", async () => {
    const upserted = useSupabase({}, { asSuperAdmin: true });
    const res = await saveRolePermissions([
      change({ role: "admin", resource: "roles", from: "none", to: "write" }),
    ]);
    expect(res.status).toBe("ok");
    expect(upserted).toHaveLength(1);
  });

  // Not a loop: `useSupabase` reads as a React hook to the lint rules, and
  // calling it in a loop trips rules-of-hooks.
  it.each([true, false])(
    "still refuses to edit super_admin (caller is super admin: %s)",
    async (asSuperAdmin) => {
      const upserted = useSupabase({}, { asSuperAdmin });
      const res = await saveRolePermissions([change({ role: "super_admin" })]);
      expect(res.status).toBe("error");
      expect(upserted).toHaveLength(0);
    },
  );

  it("honours the legacy is_super_admin flag, not just the role string", async () => {
    const upserted = useSupabase({}, { asSuperAdmin: false });
    resolveAdminPermissions.mockResolvedValue({
      role: "admin",
      isSuperAdmin: true,
      perms: { roles: "write" },
    });
    const res = await saveRolePermissions([
      change({ role: "admin", resource: "roles", from: "none", to: "write" }),
    ]);
    expect(res.status).toBe("ok");
    expect(upserted).toHaveLength(1);
  });
});

describe("input validation", () => {
  it("rejects an unknown role", async () => {
    const upserted = useSupabase();
    const result = await saveRolePermissions([
      change({ role: "root" as PermChange["role"] }),
    ]);
    expect(result).toEqual({ status: "error", message: "Invalid role: root" });
    expect(upserted).toHaveLength(0);
  });

  it("rejects any attempt to edit super_admin", async () => {
    const upserted = useSupabase();
    const result = await saveRolePermissions([
      change({ role: "super_admin", from: "write", to: "none" }),
    ]);
    expect(result).toEqual({ status: "error", message: "Super Admin permissions are fixed" });
    expect(upserted).toHaveLength(0);
  });

  it("rejects a resource outside the permission catalogue", async () => {
    const upserted = useSupabase();
    const result = await saveRolePermissions([change({ resource: "billing" })]);
    expect(result).toEqual({ status: "error", message: "Invalid resource: billing" });
    expect(upserted).toHaveLength(0);
  });

  it("rejects an unknown permission level", async () => {
    const upserted = useSupabase();
    const result = await saveRolePermissions([
      change({ to: "admin" as PermChange["to"] }),
    ]);
    expect(result).toEqual({ status: "error", message: "Invalid permission level" });
    expect(upserted).toHaveLength(0);
  });

  it("rejects an empty or non-array payload", async () => {
    useSupabase();
    expect(await saveRolePermissions([])).toEqual({
      status: "error",
      message: "No changes to save",
    });
    expect(
      await saveRolePermissions(null as unknown as PermChange[]),
    ).toEqual({ status: "error", message: "No changes to save" });
  });

  it("rejects the whole batch when any single change is invalid", async () => {
    // Validation runs over every change before the first write, so a valid
    // change cannot ride along with a forged one.
    const upserted = useSupabase();
    const result = await saveRolePermissions([change(), change({ resource: "billing" })]);
    expect(result.status).toBe("error");
    expect(upserted).toHaveLength(0);
  });
});

describe("what reaches the database", () => {
  it("writes exactly the changed cells, stamped with the acting admin", async () => {
    const upserted = useSupabase({
      rows: [{ role: "staff", resource: "books", level: "read" }],
    });
    const result = await saveRolePermissions([change()]);

    expect(result.status).toBe("ok");
    expect(upserted).toHaveLength(1);
    const rows = upserted[0].rows as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      role: "staff",
      resource: "books",
      level: "write",
      updated_by: "admin-uuid",
    });
    expect(upserted[0].options).toEqual({ onConflict: "role,resource" });
  });

  it("records the change set in the admin audit log", async () => {
    useSupabase();
    await saveRolePermissions([change()]);

    expect(logAdminAction).toHaveBeenCalledWith(
      "admin-uuid",
      "roles.permissions_update",
      "role_permissions",
      undefined,
      expect.objectContaining({
        changeCount: 1,
        roles: ["staff"],
        changes: [{ role: "staff", resource: "books", from: "read", to: "write" }],
      }),
    );
  });

  it("revalidates the page only after a successful write", async () => {
    useSupabase({ writeError: { message: "boom" } });
    const result = await saveRolePermissions([change()]);
    expect(result).toEqual({ status: "error", message: "Failed to save: boom" });
    expect(revalidateLocalizedPath).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("fails closed when the current permissions cannot be read", async () => {
    const upserted = useSupabase({ readError: { message: "offline" } });
    const result = await saveRolePermissions([change()]);
    expect(result.status).toBe("error");
    expect(upserted).toHaveLength(0);
  });
});

describe("optimistic concurrency", () => {
  it("saves when the stored level still matches what the editor started from", async () => {
    const upserted = useSupabase({
      rows: [{ role: "staff", resource: "books", level: "read" }],
    });
    expect((await saveRolePermissions([change()])).status).toBe("ok");
    expect(upserted).toHaveLength(1);
  });

  it("reports a conflict, and writes nothing, when someone else moved the cell", async () => {
    const upserted = useSupabase({
      rows: [{ role: "staff", resource: "books", level: "none" }],
    });
    const result = await saveRolePermissions([change()]);

    expect(result).toEqual({
      status: "conflict",
      // `from` is rewritten to the level the database actually holds, which is
      // what the conflict dialog offers as "take theirs".
      conflicts: [{ role: "staff", resource: "books", from: "none", to: "write" }],
    });
    expect(upserted).toHaveLength(0);
  });

  it("treats a never-persisted resource as unconflicted", async () => {
    // Its effective level came from DEFAULT_PERMISSIONS; no row means nobody
    // has written it, so the first edit must not be rejected.
    const upserted = useSupabase({ rows: [] });
    const result = await saveRolePermissions([
      change({ resource: "learning_paths", from: "read", to: "write" }),
    ]);
    expect(result.status).toBe("ok");
    expect(upserted).toHaveLength(1);
  });

  it("catches the race on a defaulted resource once the other editor's row exists", async () => {
    // A saw the default "none" and set "write"; B got there first and created
    // the row at "read". A must be stopped rather than silently overwrite B.
    const upserted = useSupabase({
      rows: [{ role: "staff", resource: "learning_paths", level: "read" }],
    });
    const result = await saveRolePermissions([
      change({ resource: "learning_paths", from: "none", to: "write" }),
    ]);

    expect(result.status).toBe("conflict");
    expect(upserted).toHaveLength(0);
  });

  it("rejects the entire batch when only one cell conflicts", async () => {
    const upserted = useSupabase({
      rows: [
        { role: "staff", resource: "books", level: "read" },
        { role: "staff", resource: "posts", level: "write" },
      ],
    });
    const result = await saveRolePermissions([
      change(),
      change({ resource: "posts", from: "read", to: "none" }),
    ]);

    expect(result.status).toBe("conflict");
    expect(upserted).toHaveLength(0);
  });
});
