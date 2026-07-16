import { redirect } from "next/navigation";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { hasPermission } from "@/lib/permissions";
import { getSettingsWorkspace } from "@/lib/system-settings/admin";
import SettingsWorkspace from "@/components/admin/system-settings/SettingsWorkspace";

export const metadata = { title: "System Settings - PTEC Library" };

/**
 * /admin/system-settings — the enterprise settings workspace: the single
 * place administrators manage global site/organization information
 * (names, contacts, address, opening hours, links, SEO defaults) with a
 * draft → validate → publish → history/rollback workflow.
 *
 * Distinct from /dashboard/settings (reader account preferences) — this
 * route is exclusively for global website configuration.
 */
export default async function SystemSettingsPage() {
  try {
    await requirePermission("settings", "read");
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) {
      redirect("/admin");
    }
    throw err;
  }

  const identity = await getAdminIdentity();
  const canWrite =
    identity.isSuperAdmin ||
    identity.role === "super_admin" ||
    hasPermission(identity.perms, "settings", "write");

  const data = await getSettingsWorkspace(canWrite);

  return <SettingsWorkspace data={data} />;
}
