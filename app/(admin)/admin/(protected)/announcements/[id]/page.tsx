import { notFound } from "next/navigation";

import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { hasPermission } from "@/lib/permissions";
import { getAnnouncementDetail } from "@/lib/admin/announcements/query";
import AnnouncementDetailClient from "@/components/admin/announcements/AnnouncementDetailClient";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export const metadata = { title: "Announcement — PTEC Admin" };

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRouteAccess("announcements.detail");

  const [identity, { id }] = await Promise.all([getAdminIdentity(), params]);
  const canWrite = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements", "write");
  const canPush = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements_push", "write");

  const detail = await getAnnouncementDetail(id);
  if (!detail) notFound();

  return <AnnouncementDetailClient detail={detail} canWrite={canWrite} canPush={canPush} />;
}
