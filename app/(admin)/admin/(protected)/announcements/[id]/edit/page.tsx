import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/admin/kit";
import AnnouncementComposer from "@/components/admin/announcements/composer/AnnouncementComposer";
import { getAnnouncementDetail } from "@/lib/admin/announcements/query";
import { rowToInput } from "@/lib/admin/announcements/mapping";
import { EDITABLE_STATUSES, normalizeStatus } from "@/lib/admin/announcements/shared";
import type { ComposerStepKey } from "@/components/admin/announcements/composer/ComposerStepNav";

export const metadata = { title: "Edit Announcement — PTEC Admin" };

const VALID_STEPS: ComposerStepKey[] = ["content", "channels", "audience", "schedule", "review"];

export default async function EditAnnouncementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  try {
    await requirePermission("announcements", "write");
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) redirect("/admin/announcements");
    throw err;
  }

  const [t, identity, { id }, sp] = await Promise.all([
    getTranslations("adminAnnouncements.composer"),
    getAdminIdentity(),
    params,
    searchParams,
  ]);
  const canPush = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements_push", "write");

  const detail = await getAnnouncementDetail(id);
  if (!detail) notFound();

  const status = normalizeStatus(detail.row.status);
  if (!EDITABLE_STATUSES.includes(status)) redirect(`/admin/announcements/${id}`);

  const initialStep = VALID_STEPS.includes(sp.step as ComposerStepKey) ? (sp.step as ComposerStepKey) : undefined;

  return (
    <div>
      <PageHeader title={t("editTitle", { name: detail.row.internal_name })} description={t("editDescription")} />
      <AnnouncementComposer mode="edit" announcementId={id} initial={rowToInput(detail.row)} initialStep={initialStep} canPush={canPush} />
    </div>
  );
}
