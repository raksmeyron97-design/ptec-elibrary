import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import IntlProvider from "@/components/providers/IntlProvider";
import { getLocale, getMessages } from "next-intl/server";
import { pickMessages, ADMIN_NAMESPACES } from "@/i18n/pick-messages";
import { MFA_ENROLL_PATH, MFA_VERIFY_PATH } from "@/lib/auth/requireAdmin";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { logSecurityEvent } from "@/lib/security-log";
import { getSidebarBadges } from "@/lib/admin/sidebar-badges";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard - PTEC Library",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Request-deduped: pages inside this layout share the same lookups.
  const identity = await getAdminIdentity();

  if (!identity.user) {
    redirect("/admin/login");
  }

  if (!ADMIN_PANEL_ROLES.includes(identity.role) && !identity.isSuperAdmin) {
    redirect("/admin/login");
  }

  // ── MFA / AAL2 enforcement (fail closed: no AAL data → no admin panel) ──
  const supabase = await createClient();
  const { data: aalData, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalError || !aalData) {
    redirect("/admin/login");
  }

  const hasEnrolledFactors =
    aalData.nextLevel === "aal2" || aalData.currentLevel === "aal2";

  if (hasEnrolledFactors && aalData.currentLevel !== "aal2") {
    logSecurityEvent({
      type: "mfa_required",
      where: "admin/(protected)/layout",
      userId: identity.user.id,
    });
    redirect(MFA_VERIFY_PATH);
  }

  if (!hasEnrolledFactors) {
    redirect(MFA_ENROLL_PATH);
  }

  const [locale, allMessages, badges] = await Promise.all([
    getLocale(),
    getMessages(),
    getSidebarBadges(identity.perms),
  ]);

  return (
    <IntlProvider
      locale={locale}
      messages={pickMessages(allMessages, ADMIN_NAMESPACES)}
    >
      <AdminSidebar
        email={identity.user.email}
        fullName={identity.fullName}
        avatarUrl={identity.avatarUrl}
        role={identity.role}
        isSuperAdmin={identity.isSuperAdmin}
        userPermissions={identity.perms}
        badges={badges}
      >
        {children}
      </AdminSidebar>
    </IntlProvider>
  );
}
