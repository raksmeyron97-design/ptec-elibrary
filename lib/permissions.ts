import "server-only";

import type { AppRole, PermLevel } from "./types/roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseService = { from: (table: string) => any };

/** Hardcoded fallback — matches the migration seeds in 0041_role_permissions.sql + 0052_publications.sql + 0098_system_settings.sql + 0100_announcement_center.sql + 0101_storage_permissions.sql + 0118_homepage_photos.sql */
export const DEFAULT_PERMISSIONS: Record<AppRole, Record<string, PermLevel>> = {
  reader:      { books: "read",  catalog: "read",  research: "read",  publications: "read",  posts: "read",  announcements: "read",  announcements_push: "none",  learning_paths: "read",   homepage_photos: "none",  users: "none",  roles: "none", contact: "none",  settings: "none",  storage: "none",  storage_manage: "none"  },
  staff:       { books: "read",  catalog: "read",  research: "read",  publications: "read",  posts: "write", announcements: "write", announcements_push: "none",  learning_paths: "read",   homepage_photos: "write", users: "none",  roles: "none", contact: "write", settings: "none",  storage: "write", storage_manage: "none"  },
  librarian:   { books: "write", catalog: "write", research: "write", publications: "write", posts: "read",  announcements: "read",  announcements_push: "none",  learning_paths: "write",  homepage_photos: "write", users: "none",  roles: "none", contact: "write", settings: "none",  storage: "write", storage_manage: "none"  },
  admin:       { books: "write", catalog: "write", research: "write", publications: "write", posts: "write", announcements: "write", announcements_push: "write", learning_paths: "write",  homepage_photos: "write", users: "write", roles: "none", contact: "write", settings: "write", storage: "write", storage_manage: "none"  },
  super_admin: { books: "write", catalog: "write", research: "write", publications: "write", posts: "write", announcements: "write", announcements_push: "write", learning_paths: "write",  homepage_photos: "write", users: "write", roles: "write", contact: "write", settings: "write", storage: "write", storage_manage: "write" },
};

/** Every known resource set to "none" — the fail-closed permission map. */
function denyAllPermissions(): Record<string, PermLevel> {
  const perms: Record<string, PermLevel> = {};
  for (const resource of Object.keys(DEFAULT_PERMISSIONS.super_admin)) {
    perms[resource] = "none";
  }
  return perms;
}

/**
 * Fetch the permissions for a role from the `role_permissions` table.
 *
 * Fail-closed: if the query ERRORS (table missing, RLS change, connection
 * failure) we deny everything rather than fall back to defaults — a broken
 * authorization data source must never silently restore write access. Super
 * admins are unaffected because `requirePermission` short-circuits for them, so
 * an outage can't lock the whole panel out. A successful query that returns NO
 * rows is the legitimate "not yet configured" case (migrations seed this
 * table), so there we still use the hardcoded defaults.
 */
export async function getPermissionsForRole(
  role: AppRole,
  supabase: SupabaseService,
): Promise<Record<string, PermLevel>> {
  try {
    const { data, error } = await supabase
      .from("role_permissions")
      .select("resource, level")
      .eq("role", role);

    if (error) {
      console.error(
        `[permissions] role_permissions query failed for role "${role}"; failing closed (deny-all):`,
        error.message ?? error,
      );
      return denyAllPermissions();
    }

    if (!data?.length) {
      return { ...DEFAULT_PERMISSIONS[role] };
    }

    // Start from defaults so any missing rows still have a sensible value
    const perms: Record<string, PermLevel> = { ...DEFAULT_PERMISSIONS[role] };
    for (const row of data) {
      perms[row.resource] = row.level as PermLevel;
    }
    return perms;
  } catch (e) {
    console.error(
      `[permissions] unexpected error resolving permissions for role "${role}"; failing closed (deny-all):`,
      e,
    );
    return denyAllPermissions();
  }
}

/** Returns true when `perms[resource]` meets or exceeds `minLevel`. */
export function hasPermission(
  perms: Record<string, PermLevel>,
  resource: string,
  minLevel: "read" | "write",
): boolean {
  const level = perms[resource] ?? "none";
  if (minLevel === "write") return level === "write";
  return level !== "none"; // "read" requires at minimum "read" or "write"
}
