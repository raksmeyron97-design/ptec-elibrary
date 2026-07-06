"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/requireAdmin";
import type { AppRole, PermLevel } from "@/lib/types/roles";

const VALID_RESOURCES = new Set([
  "books", "catalog", "research", "posts", "announcements", "learning_paths", "users", "roles",
]);
const VALID_LEVELS = new Set<PermLevel>(["none", "read", "write"]);

export async function updateRolePermission(
  role: AppRole,
  resource: string,
  level: PermLevel,
): Promise<void> {
  const { supabase, user } = await requireSuperAdmin();

  if (!VALID_RESOURCES.has(resource)) throw new Error("Invalid resource");
  if (!VALID_LEVELS.has(level)) throw new Error("Invalid permission level");
  if (role === "super_admin") throw new Error("super_admin permissions are fixed");

  const { error } = await supabase
    .from("role_permissions")
    .upsert(
      { role, resource, level, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: "role,resource" },
    );

  if (error) throw new Error(`Failed to save: ${error.message}`);

  revalidatePath("/admin/roles");
}
