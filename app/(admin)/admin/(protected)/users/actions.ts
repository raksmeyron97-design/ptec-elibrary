"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_ROLES } from "@/lib/types/roles";

export async function setUserRole(
  targetUserId: string,
  newRole: AppRole,
): Promise<void> {
  const { supabase, user } = await requireAdmin();

  if (user.id === targetUserId) {
    throw new Error("You cannot change your own role");
  }

  // Fetch the caller's profile to check super-admin status
  const { data: callerProfile, error: callerErr } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .single();

  if (callerErr || !callerProfile) {
    throw new Error("Unable to verify caller permissions");
  }

  const callerIsSuperAdmin =
    callerProfile.is_super_admin || callerProfile.role === "super_admin";

  // Only super_admin may assign admin or super_admin roles
  if (ADMIN_ROLES.includes(newRole) && !callerIsSuperAdmin) {
    throw new Error("Only a super admin can assign admin or super_admin roles");
  }

  // Protect super admins: only a super admin may change a super admin's role
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", targetUserId)
    .single();

  if (
    (targetProfile?.is_super_admin || targetProfile?.role === "super_admin") &&
    !callerIsSuperAdmin
  ) {
    throw new Error("Only a super admin can change a super admin's role");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) throw new Error(`Role update failed: ${error.message}`);

  // Log the role change
  await supabase.from("admin_audit_log").insert({
    admin_id: user.id,
    action: "setUserRole",
    target_table: "profiles",
    target_id: targetUserId,
    metadata: {
      from: targetProfile?.role ?? "unknown",
      to: newRole,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/roles");
}

/** Backward-compatible wrapper — kept so any external call doesn't break. */
export async function toggleUserRole(
  targetUserId: string,
  currentRole: "reader" | "admin",
): Promise<void> {
  const newRole: AppRole = currentRole === "admin" ? "reader" : "admin";
  return setUserRole(targetUserId, newRole);
}
