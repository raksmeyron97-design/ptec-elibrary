import { notFound, redirect } from "next/navigation";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { hasPermission } from "@/lib/permissions";
import { getAnnouncementDetail } from "@/lib/admin/announcements/query";
import AnnouncementDetailClient from "@/components/admin/announcements/AnnouncementDetailClient";

export const metadata = { title: "Announcement — PTEC Admin" };

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("announcements", "read");
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) redirect("/admin/announcements");
    throw err;
  }

  const [identity, { id }] = await Promise.all([getAdminIdentity(), params]);
  const canWrite = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements", "write");
  const canPush = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements_push", "write");

  const detail = await getAnnouncementDetail(id);
  if (!detail) notFound();

  return <AnnouncementDetailClient detail={detail} canWrite={canWrite} canPush={canPush} />;
}
