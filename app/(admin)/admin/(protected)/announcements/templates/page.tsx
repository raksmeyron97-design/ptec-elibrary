import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/admin/kit";
import AnnouncementTemplatesClient from "@/components/admin/announcements/AnnouncementTemplatesClient";
import { listAnnouncementTemplates } from "@/lib/admin/announcements/templates";

export const metadata = { title: "Announcement Templates — PTEC Admin" };

export default async function AnnouncementTemplatesPage() {
  try {
    await requirePermission("announcements", "read");
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) redirect("/admin/announcements");
    throw err;
  }

  const [t, identity, templates] = await Promise.all([
    getTranslations("adminAnnouncements.templates"),
    getAdminIdentity(),
    listAnnouncementTemplates(),
  ]);
  const canWrite = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements", "write");

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />
      <AnnouncementTemplatesClient templates={templates} canWrite={canWrite} />
    </div>
  );
}
