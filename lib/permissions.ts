import "server-only";

import type { AppRole, PermLevel } from "./types/roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseService = { from: (table: string) => any };

/** Hardcoded fallback — matches the migration seeds in 0041_role_permissions.sql + 0052_publications.sql */
export const DEFAULT_PERMISSIONS: Record<AppRole, Record<string, PermLevel>> = {
  reader:      { books: "read",  catalog: "read",  research: "read",  publications: "read",  posts: "read",  announcements: "read",  users: "none",  roles: "none" },
  staff:       { books: "read",  catalog: "read",  research: "read",  publications: "read",  posts: "write", announcements: "write", users: "none",  roles: "none" },
  librarian:   { books: "write", catalog: "write", research: "write", publications: "write", posts: "read",  announcements: "read",  users: "none",  roles: "none" },
  admin:       { books: "write", catalog: "write", research: "write", publications: "write", posts: "write", announcements: "write", users: "write", roles: "none" },
  super_admin: { books: "write", catalog: "write", research: "write", publications: "write", posts: "write", announcements: "write", users: "write", roles: "write" },
};

/**
 * Fetch the permissions for a role from the `role_permissions` table.
 * Falls back to DEFAULT_PERMISSIONS if the table doesn't exist or has no rows.
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

    if (error || !data?.length) {
      return { ...DEFAULT_PERMISSIONS[role] };
    }

    // Start from defaults so any missing rows still have a sensible value
    const perms: Record<string, PermLevel> = { ...DEFAULT_PERMISSIONS[role] };
    for (const row of data) {
      perms[row.resource] = row.level as PermLevel;
    }
    return perms;
  } catch {
    return { ...DEFAULT_PERMISSIONS[role] };
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
