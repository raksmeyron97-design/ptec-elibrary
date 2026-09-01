

import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { hasPermission } from "@/lib/permissions";
import { getSettingsWorkspace } from "@/lib/system-settings/admin";
import SettingsWorkspace from "@/components/admin/system-settings/SettingsWorkspace";
import { requireRouteAccess } from "@/lib/admin/route-guard";

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
  await requireRouteAccess("settings.manage");

  const identity = await getAdminIdentity();
  const canWrite =
    identity.isSuperAdmin ||
    identity.role === "super_admin" ||
    hasPermission(identity.perms, "settings", "write");

  const data = await getSettingsWorkspace(canWrite);

  return <SettingsWorkspace data={data} />;
}
