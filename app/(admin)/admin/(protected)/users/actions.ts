"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_ROLES } from "@/lib/types/roles";

export type ActionResult = { success: boolean; error?: string };

// A ~100-year ban is Supabase's idiom for "suspend indefinitely".
const SUSPEND_DURATION = "876000h";

function msg(e: unknown, fallback = "Action failed"): string {
  return e instanceof Error ? e.message : fallback;
}

/** Shared authz context: caller identity + super-admin flag + audit helper. */
async function adminContext() {
  const { supabase, user } = await requireAdmin();
  const { data: caller } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .single();
  const callerIsSuperAdmin = Boolean(caller?.is_super_admin) || caller?.role === "super_admin";

  async function audit(action: string, targetId: string, metadata: Record<string, unknown>) {
    await supabase.from("admin_audit_log").insert({
      admin_id: user.id,
      action,
      target_table: "profiles",
      target_id: targetId,
      metadata,
    });
  }

  return { supabase, user, callerIsSuperAdmin, audit };
}

/** Guard: the target user is a super admin the caller may not touch. */
async function assertCanManageTarget(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  targetUserId: string,
  callerIsSuperAdmin: boolean,
  callerId: string,
): Promise<void> {
  if (targetUserId === callerId) throw new Error("You cannot perform this action on your own account");
  const { data: target } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", targetUserId)
    .single();
  const targetIsSuperAdmin = Boolean(target?.is_super_admin) || target?.role === "super_admin";
  if (targetIsSuperAdmin && !callerIsSuperAdmin) {
    throw new Error("Only a super admin can manage another super admin");
  }
}

function revalidate() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/roles");
}

// ── ROLES ────────────────────────────────────────────────────────────────────
export async function setUserRole(targetUserId: string, newRole: AppRole): Promise<void> {
  const { supabase, user, callerIsSuperAdmin, audit } = await adminContext();

  if (user.id === targetUserId) throw new Error("You cannot change your own role");
  if (ADMIN_ROLES.includes(newRole) && !callerIsSuperAdmin) {
    throw new Error("Only a super admin can assign admin or super_admin roles");
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", targetUserId)
    .single();
  if ((target?.is_super_admin || target?.role === "super_admin") && !callerIsSuperAdmin) {
    throw new Error("Only a super admin can change a super admin's role");
  }

  const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", targetUserId);
  if (error) throw new Error(`Role update failed: ${error.message}`);

  await audit("user_role.update", targetUserId, { from: target?.role ?? "unknown", to: newRole });
  revalidate();
}

/** ActionResult wrapper so the client can render inline errors instead of throwing. */
export async function assignRole(targetUserId: string, newRole: AppRole): Promise<ActionResult> {
  try {
    await setUserRole(targetUserId, newRole);
    return { success: true };
  } catch (e) {
    return { success: false, error: msg(e, "Failed to update role") };
  }
}

export async function bulkAssignRole(userIds: string[], newRole: AppRole): Promise<ActionResult> {
  try {
    const { user, callerIsSuperAdmin } = await adminContext();
    if (ADMIN_ROLES.includes(newRole) && !callerIsSuperAdmin) {
      return { success: false, error: "Only a super admin can assign admin roles" };
    }
    const targets = userIds.filter((id) => id !== user.id);
    for (const id of targets) {
      try {
        await setUserRole(id, newRole);
      } catch {
        /* skip protected/failed rows; continue the batch */
      }
    }
    revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: msg(e) };
  }
}

// ── ACCOUNT STATUS (real today via auth ban) ─────────────────────────────────
export async function setUserStatus(
  targetUserId: string,
  action: "suspend" | "activate" | "block",
): Promise<ActionResult> {
  try {
    const { supabase, user, callerIsSuperAdmin, audit } = await adminContext();
    await assertCanManageTarget(supabase, targetUserId, callerIsSuperAdmin, user.id);

    const service = createServiceClient();
    const ban_duration = action === "activate" ? "none" : SUSPEND_DURATION;
    const { error } = await service.auth.admin.updateUserById(targetUserId, { ban_duration });
    if (error) return { success: false, error: error.message };

    // Best-effort profile status pin (no-op before migration 0089).
    const nextStatus = action === "activate" ? "active" : action === "block" ? "blocked" : "disabled";
    await service.from("profiles").update({ status: nextStatus }).eq("id", targetUserId);

    await audit(`user_status.${action}`, targetUserId, { action });
    revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: msg(e) };
  }
}

// ── PASSWORD RESET (real — emails the user a recovery link) ───────────────────
export async function sendPasswordReset(targetUserId: string): Promise<ActionResult> {
  try {
    const { supabase, audit } = await adminContext();
    const { data: target } = await supabase.from("profiles").select("email").eq("id", targetUserId).single();
    if (!target?.email) return { success: false, error: "This user has no email on file" };

    const service = createServiceClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`;
    const { error } = await service.auth.resetPasswordForEmail(target.email, { redirectTo });
    if (error) return { success: false, error: error.message };

    await audit("user_password.reset_sent", targetUserId, { email: target.email });
    return { success: true };
  } catch (e) {
    return { success: false, error: msg(e) };
  }
}

// ── DELETE (real — removes auth user; profile cascades) ───────────────────────
export async function deleteUser(targetUserId: string): Promise<ActionResult> {
  try {
    const { supabase, user, callerIsSuperAdmin, audit } = await adminContext();
    await assertCanManageTarget(supabase, targetUserId, callerIsSuperAdmin, user.id);

    const service = createServiceClient();
    const { error } = await service.auth.admin.deleteUser(targetUserId);
    if (error) return { success: false, error: error.message };

    await audit("user.delete", targetUserId, {});
    revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: msg(e) };
  }
}

// ── INVITE (real — emails an invite; sets the requested role) ─────────────────
export async function inviteUser(email: string, role: AppRole = "reader"): Promise<ActionResult> {
  try {
    const { callerIsSuperAdmin, audit } = await adminContext();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { success: false, error: `Invalid email: ${email}` };
    if (ADMIN_ROLES.includes(role) && !callerIsSuperAdmin) {
      return { success: false, error: "Only a super admin can invite admins" };
    }

    const service = createServiceClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`;
    const { data, error } = await service.auth.admin.inviteUserByEmail(clean, { redirectTo });
    if (error) return { success: false, error: error.message };

    const newId = data.user?.id;
    if (newId && role !== "reader") {
      await service.from("profiles").update({ role }).eq("id", newId);
    }
    if (newId) await audit("user.invite", newId, { email: clean, role });
    revalidate();
    return { success: true };
  } catch (e) {
    return { success: false, error: msg(e) };
  }
}

export async function bulkInviteUsers(emails: string[], role: AppRole = "reader"): Promise<ActionResult> {
  const list = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (list.length === 0) return { success: false, error: "No email addresses provided" };
  if (list.length > 50) return { success: false, error: "Please invite at most 50 users at a time" };
  let failed = 0;
  for (const e of list) {
    const r = await inviteUser(e, role);
    if (!r.success) failed++;
  }
  return failed === 0
    ? { success: true }
    : { success: failed < list.length, error: `${failed} of ${list.length} invites failed` };
}

/** Backward-compatible wrapper — kept so any external call doesn't break. */
export async function toggleUserRole(
  targetUserId: string,
  currentRole: "reader" | "admin",
): Promise<void> {
  const newRole: AppRole = currentRole === "admin" ? "reader" : "admin";
  return setUserRole(targetUserId, newRole);
}

/** Server action wrapper for the drawer's on-demand detail fetch. */
export async function fetchUserDetail(userId: string) {
  await requireAdmin();
  const { getUserDetail } = await import("@/lib/admin/users");
  return getUserDetail(userId);
}
