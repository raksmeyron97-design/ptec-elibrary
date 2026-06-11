import { getAnnouncementsForAdmin } from "@/app/actions/notifications";
import AnnouncementsClient from "./AnnouncementsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Announcements — PTEC Admin" };

export default async function AnnouncementsPage() {
  const { data: announcements } = await getAnnouncementsForAdmin();

  return (
    <div className="mx-auto max-w-[800px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-heading">Announcements</h1>
        <p className="text-sm text-text-muted mt-1">
          Broadcast messages to all library users.
        </p>
      </div>
      <AnnouncementsClient announcements={announcements} />
    </div>
  );
}
