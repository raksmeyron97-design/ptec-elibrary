import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/admin/kit";
import AnnouncementComposer, { EMPTY_INPUT } from "@/components/admin/announcements/composer/AnnouncementComposer";
import { getAnnouncementTemplate } from "@/lib/admin/announcements/templates";
import type { AnnouncementInput } from "@/lib/admin/announcements/validation";

export const metadata = { title: "New Announcement — PTEC Admin" };

export default async function NewAnnouncementPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  try {
    await requirePermission("announcements", "write");
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) redirect("/admin/announcements");
    throw err;
  }

  const [t, identity, sp] = await Promise.all([getTranslations("adminAnnouncements.composer"), getAdminIdentity(), searchParams]);
  const canPush = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements_push", "write");

  let initial: AnnouncementInput = EMPTY_INPUT;
  if (sp.template) {
    const tpl = await getAnnouncementTemplate(sp.template);
    if (tpl) {
      initial = {
        ...EMPTY_INPUT,
        internalName: `${tpl.name}`,
        type: tpl.type as AnnouncementInput["type"],
        priority: tpl.priority as AnnouncementInput["priority"],
        content: {
          en: { title: tpl.titleEn, summary: tpl.summaryEn ?? "", body: tpl.bodyEn ?? "", ctaLabel: tpl.ctaLabelEn ?? "" },
          km: { title: tpl.titleKm ?? "", summary: tpl.summaryKm ?? "", body: tpl.bodyKm ?? "", ctaLabel: tpl.ctaLabelKm ?? "" },
        },
        ctaUrl: tpl.ctaUrl,
        channels: { inApp: tpl.defaultChannels.in_app, banner: tpl.defaultChannels.banner, push: tpl.defaultChannels.push },
      };
    }
  }

  return (
    <div>
      <PageHeader title={t("createTitle")} description={t("createDescription")} />
      <AnnouncementComposer mode="create" initial={initial} canPush={canPush} />
    </div>
  );
}
