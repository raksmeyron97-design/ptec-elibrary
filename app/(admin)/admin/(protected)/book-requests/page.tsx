import { getTranslations } from "next-intl/server";
import { adminGetBookRequests } from "@/app/actions/book-requests";
import { PageHeader, StatusBadge } from "@/components/admin/kit";
import BookRequestsClient from "./BookRequestsClient";

export const dynamic = "force-dynamic";

export default async function BookRequestsPage() {
  const [t, requests] = await Promise.all([
    getTranslations("adminBookRequests"),
    adminGetBookRequests(),
  ]);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          pendingCount > 0 ? (
            <StatusBadge tone="warning" className="px-2.5 py-1 text-xs">
              {t("pendingBadge", { count: pendingCount })}
            </StatusBadge>
          ) : undefined
        }
      />
      <BookRequestsClient requests={requests} />
    </div>
  );
}
