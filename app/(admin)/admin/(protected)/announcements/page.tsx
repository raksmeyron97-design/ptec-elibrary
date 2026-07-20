import { getTranslations } from "next-intl/server";
import { getAnnouncementsForAdmin } from "@/app/actions/notifications";
import { PageHeader } from "@/components/admin/kit";
import AnnouncementsClient from "./AnnouncementsClient";
import PushNotificationSender from "@/components/admin/PushNotificationSender";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Announcements — PTEC Admin" };

export default async function AnnouncementsPage() {
  const [t, { data: announcements }] = await Promise.all([
    getTranslations("adminAnnouncements"),
    getAnnouncementsForAdmin(),
  ]);

  return (
    <div className="mx-auto max-w-[800px]">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-6">
        <PushNotificationSender />
        <AnnouncementsClient announcements={announcements} />
      </div>
    </div>
  );
}
