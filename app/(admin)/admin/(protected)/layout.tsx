import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { MFA_ENROLL_PATH, MFA_VERIFY_PATH } from "@/lib/auth/requireAdmin";
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
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/admin/login");
  }

  // ── MFA / AAL2 enforcement ──────────────────────────────────────────────
  // Admins must complete TOTP verification before accessing any admin page.
  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData) {
    const hasEnrolledFactors =
      aalData.nextLevel === "aal2" || aalData.currentLevel === "aal2";

    if (hasEnrolledFactors && aalData.currentLevel !== "aal2") {
      // User has MFA enrolled but hasn't verified in this session
      redirect(MFA_VERIFY_PATH);
    }

    if (!hasEnrolledFactors) {
      // User has no MFA factors enrolled — force enrollment
      redirect(MFA_ENROLL_PATH);
    }
  }

  return (
    <AdminSidebar email={user.email}>
      {children}
    </AdminSidebar>
  );
}

