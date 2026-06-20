"use server";

// app/admin/users/actions.ts
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function toggleUserRole(
  targetUserId: string,
  currentRole: "reader" | "admin"
) {
  const { supabase, user } = await requireAdmin();

  // Safety: can't change your own role
  if (user.id === targetUserId) throw new Error("You cannot change your own role");

  // Look up the caller's super-admin status
  const { data: callerProfile, error: callerProfileError } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  if (callerProfileError || !callerProfile) {
    throw new Error("Unable to verify super-admin status.");
  }

  const newRole = currentRole === "admin" ? "reader" : "admin";
  const isPromotion = newRole === "admin";

  // ── Only a super admin can promote a user to admin ──────────────────────────
  // This is the security boundary. The UI also disables the button for regular
  // admins, but this check is what actually enforces the rule.
  if (isPromotion && !callerProfile.is_super_admin) {
    throw new Error("Only a super admin can promote a user to admin.");
  }

  // Protect super admins: only a super admin may change another super admin's
  // role. Without this, a regular admin could demote (lock out) a super admin.
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", targetUserId)
    .single();
  if (targetProfile?.is_super_admin && !callerProfile.is_super_admin) {
    throw new Error("Only a super admin can change a super admin's role.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) throw new Error(`Role update failed: ${error.message}`);

  revalidatePath("/admin/users");
}