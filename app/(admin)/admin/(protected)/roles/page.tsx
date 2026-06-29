import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperAdmin, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { redirect } from "next/navigation";
import RolesClient from "./RolesClient";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ALL_ROLES } from "@/lib/types/roles";

export default async function AdminRolesPage() {
  try {
    await requireSuperAdmin();
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) {
      redirect("/admin");
    }
    throw err;
  }

  const supabase = createServiceClient();

  const [profilesResult, permsResult] = await Promise.all([
    supabase.from("profiles").select("role"),
    supabase.from("role_permissions").select("role, resource, level"),
  ]);

  // Role counts
  const roleCounts: Record<AppRole, number> = {
    reader: 0, staff: 0, librarian: 0, admin: 0, super_admin: 0,
  };
  for (const p of profilesResult.data ?? []) {
    const r = p.role as AppRole;
    if (r in roleCounts) roleCounts[r]++;
  }

  // Build permissions map: role → resource → level
  const permissions: Record<AppRole, Record<string, PermLevel>> = {
    reader: {}, staff: {}, librarian: {}, admin: {}, super_admin: {},
  };
  for (const row of permsResult.data ?? []) {
    const r = row.role as AppRole;
    if (r in permissions) {
      permissions[r][row.resource] = row.level as PermLevel;
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-heading">Role Management</h1>
        <p className="mt-1 text-sm text-text-muted">
          Overview of all system roles and their permissions. Click{" "}
          <span className="font-medium text-text-body">Edit Permissions</span> to modify the matrix.
          Assign roles to users from the{" "}
          <a href="/admin/users" className="text-brand underline-offset-2 hover:underline">Users page</a>.
        </p>
      </div>

      <RolesClient
        roleCounts={roleCounts}
        totalUsers={(profilesResult.data ?? []).length}
        allRoles={ALL_ROLES}
        initialPermissions={permissions}
      />
    </div>
  );
}