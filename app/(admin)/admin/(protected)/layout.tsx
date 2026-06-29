import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { MFA_ENROLL_PATH, MFA_VERIFY_PATH } from "@/lib/auth/requireAdmin";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import type { AppRole } from "@/lib/types/roles";
import { getPermissionsForRole } from "@/lib/permissions";
import type { PermLevel } from "@/lib/types/roles";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard - PTEC Library",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/admin/login");
  }

  const supabaseService = createServiceClient();
  const { data: profile } = await supabaseService
    .from("profiles")
    .select("role, is_super_admin, full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "reader") as AppRole;
  const isSuperAdmin = (profile?.is_super_admin ?? false) as boolean;
  const fullName = (profile?.full_name ?? null) as string | null;
  const avatarUrl = (profile?.avatar_url ?? null) as string | null;

  if (!ADMIN_PANEL_ROLES.includes(role)) {
    redirect("/admin/login");
  }

  // ── MFA / AAL2 enforcement ──────────────────────────────────────────────
  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData) {
    const hasEnrolledFactors =
      aalData.nextLevel === "aal2" || aalData.currentLevel === "aal2";

    if (hasEnrolledFactors && aalData.currentLevel !== "aal2") {
      redirect(MFA_VERIFY_PATH);
    }

    if (!hasEnrolledFactors) {
      redirect(MFA_ENROLL_PATH);
    }
  }

  // Fetch the DB-stored permissions for this role (falls back to hardcoded defaults)
  const effectiveRole = (isSuperAdmin || role === "super_admin") ? "super_admin" : role;
  const userPermissions: Record<string, PermLevel> = await getPermissionsForRole(
    effectiveRole,
    supabaseService,
  );

  return (
    <AdminSidebar
      email={user.email}
      fullName={fullName}
      avatarUrl={avatarUrl}
      role={role}
      isSuperAdmin={isSuperAdmin}
      userPermissions={userPermissions}
    >
      {children}
    </AdminSidebar>
  );
}
