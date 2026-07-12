"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/requireAdmin";
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
 */
export async function saveRolePermissions(changes: PermChange[]): Promise<SaveResult> {
  const { supabase, user } = await requireSuperAdmin();

  if (!Array.isArray(changes) || changes.length === 0) {
    return { status: "error", message: "No changes to save" };
  }

  // Validate every change up front.
  for (const c of changes) {
    if (!VALID_ROLES.has(c.role)) return { status: "error", message: `Invalid role: ${c.role}` };
    if (c.role === "super_admin") return { status: "error", message: "Super Admin permissions are fixed" };
    if (!VALID_RESOURCES.has(c.resource)) return { status: "error", message: `Invalid resource: ${c.resource}` };
    if (!VALID_LEVELS.has(c.to) || !VALID_LEVELS.has(c.from)) {
      return { status: "error", message: "Invalid permission level" };
    }
  }

  // ── Conflict detection ──────────────────────────────────────────────────
  // Fetch current DB rows for the affected roles, then compare each changed
  // cell against the `from` the editor believed was current.
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

  revalidatePath("/admin/roles");
  return { status: "ok", savedAt };
}
