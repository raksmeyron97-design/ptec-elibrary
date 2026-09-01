"use server";

import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { resolveAdminPermissions } from "@/lib/auth/requireAdmin";
import { requireAction } from "@/lib/admin/route-guard";
import { isElevatedResource, isSuperAdminViewer } from "@/lib/admin/access-policy";
import { logAdminAction } from "@/app/actions/audit";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ALL_RESOURCE_KEYS, type PermChange } from "@/lib/admin/roles-shared";

const VALID_RESOURCES = new Set(ALL_RESOURCE_KEYS);
const VALID_LEVELS = new Set<PermLevel>(["none", "read", "write"]);
const VALID_ROLES = new Set<AppRole>(["reader", "staff", "librarian", "admin", "super_admin"]);

export type SaveResult =
  | { status: "ok"; savedAt: string }
  | { status: "conflict"; conflicts: PermChange[] }
  | { status: "error"; message: string };

/**
 * Persist a batch of permission changes in a single call.
 *
 * Optimistic-concurrency: each change carries the `from` level the editor
 * started with. Before writing we re-read the current DB level for every
 * changed cell; if any differs from `from`, someone else edited it meanwhile
 * and we return a `conflict` instead of silently clobbering their change.
 *
 * Authorization is `roles: write` (ROUTE/ACTION policy `roles.save`), the same
 * requirement as the page that hosts this editor — role management is delegable
 * now, so a super admin can hand it to a trusted `admin` from the matrix itself
 * rather than by editing a hardcoded role list.
 *
 * A permission level is not the whole check, though. `roles: write` is the one
 * grant that can grant grants, so three rules ride on top of it; they are named
 * in `ROLES_DELEGATION_RULES` and enforced below.
 */
export async function saveRolePermissions(changes: PermChange[]): Promise<SaveResult> {
  const { supabase, user } = await requireAction("roles.save");

  // Who is asking — resolved through the same request-deduped path the guard
  // above already used, so this costs no extra round-trip.
  const { role, isSuperAdmin } = await resolveAdminPermissions();
  const editorIsSuperAdmin = isSuperAdminViewer({ role, isSuperAdmin, perms: {} });

  if (!Array.isArray(changes) || changes.length === 0) {
    return { status: "error", message: "No changes to save" };
  }

  // ── Rule: wellFormedChange ──────────────────────────────────────────────
  for (const c of changes) {
    if (!VALID_ROLES.has(c.role)) return { status: "error", message: `Invalid role: ${c.role}` };
    // ── Rule: superAdminRowImmutable ──────────────────────────────────────
    if (c.role === "super_admin") return { status: "error", message: "Super Admin permissions are fixed" };
    if (!VALID_RESOURCES.has(c.resource)) return { status: "error", message: `Invalid resource: ${c.resource}` };
    if (!VALID_LEVELS.has(c.to) || !VALID_LEVELS.has(c.from)) {
      return { status: "error", message: "Invalid permission level" };
    }

    /* ── Rule: rolesRowSuperAdminOnly ────────────────────────────────────────
       Delegation is not transitive. A delegated administrator (`roles: write`,
       granted by a super admin) administers every other permission, but may not
       appoint further administrators — and, by the same rule, may not revoke
       their own grant, so there is no way to lock themselves or anyone else out
       of this page by editing it. Widening or withdrawing role management stays
       a decision only a super admin can make.

       This is checked per cell rather than only on the control that produced it
       because a bulk action ("copy Admin onto Staff", "reset to defaults")
       reaches the same rows through a different path. */
    if (isElevatedResource(c.resource) && !editorIsSuperAdmin) {
      return {
        status: "error",
        message:
          "Only a Super Admin can change who manages roles. Ask a Super Admin to grant or revoke Roles access.",
      };
    }
  }

  // ── Conflict detection ──────────────────────────────────────────────────
  // Fetch current DB rows for the affected roles, then compare each changed
  // cell against the `from` the editor believed was current.
  //
  // Note what "current" means for a resource that has never been persisted:
  // its effective level comes from DEFAULT_PERMISSIONS, and the absence of a
  // row is not evidence that anyone changed it. But the moment another editor
  // saves that cell a row DOES appear, so a second editor who started from the
  // default still collides — `dbLevel` is then their value, not the default,
  // and the comparison below catches it. Treating "no row" as a conflict
  // instead would make every first-ever edit of a defaulted resource fail.
  const affectedRoles = Array.from(new Set(changes.map((c) => c.role)));
  const { data: currentRows, error: readErr } = await supabase
    .from("role_permissions")
    .select("role, resource, level")
    .in("role", affectedRoles);

  if (readErr) return { status: "error", message: `Could not read current permissions: ${readErr.message}` };

  const currentLevel = new Map<string, PermLevel>();
  for (const row of currentRows ?? []) {
    currentLevel.set(`${row.role}:${row.resource}`, row.level as PermLevel);
  }

  const conflicts: PermChange[] = [];
  for (const c of changes) {
    // A missing row means the resource has never been persisted for this role;
    // its effective value came from the hardcoded defaults, so only treat it as
    // a conflict when a row exists whose level differs from what the editor saw.
    const dbLevel = currentLevel.get(`${c.role}:${c.resource}`);
    if (dbLevel !== undefined && dbLevel !== c.from) {
      conflicts.push({ ...c, from: dbLevel });
    }
  }
  if (conflicts.length > 0) return { status: "conflict", conflicts };

  // ── Write ───────────────────────────────────────────────────────────────
  const savedAt = new Date().toISOString();
  const rows = changes.map((c) => ({
    role: c.role,
    resource: c.resource,
    level: c.to,
    updated_at: savedAt,
    updated_by: user.id,
  }));

  const { error } = await supabase
    .from("role_permissions")
    .upsert(rows, { onConflict: "role,resource" });

  if (error) return { status: "error", message: `Failed to save: ${error.message}` };

  // ── Audit ───────────────────────────────────────────────────────────────
  // Role permissions are the panel's highest-privilege mutation and were the
  // one admin write with no trail: `admin_audit_log` recorded book edits and
  // contact replies but not "who granted Staff write access to Users". One row
  // per save, carrying every cell's before/after, so the log answers that
  // without needing a diff of the table's own history.
  await logAdminAction(user.id, "roles.permissions_update", "role_permissions", undefined, {
    changeCount: changes.length,
    roles: Array.from(new Set(changes.map((c) => c.role))),
    changes: changes.map((c) => ({ role: c.role, resource: c.resource, from: c.from, to: c.to })),
  });

  revalidatePath("/admin/roles");
  return { status: "ok", savedAt };
}
