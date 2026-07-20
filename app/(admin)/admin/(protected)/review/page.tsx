import { getTranslations } from "next-intl/server";
import { getReviewQueue, getReviewerOptions } from "@/app/actions/review";
import { requireLibrarian } from "@/lib/auth/requireAdmin";
import { ADMIN_ROLES } from "@/lib/types/roles";
import { PageHeader, StatusBadge } from "@/components/admin/kit";
import ReviewQueueClient from "./ReviewQueueClient";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const [t, { userId, role }, items, reviewers] = await Promise.all([
    getTranslations("adminReview"),
    requireLibrarian(),
    getReviewQueue(),
    getReviewerOptions(),
  ]);
  const actionable = items.filter(
    (i) => i.status === "needs_review" || i.status === "in_review" || i.status === "imported",
  ).length;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          actionable > 0 ? (
            <StatusBadge tone="warning" className="px-2.5 py-1 text-xs">
              {t("waiting", { count: actionable })}
            </StatusBadge>
          ) : undefined
        }
      />
      <ReviewQueueClient
        items={items}
        reviewers={reviewers}
        viewerId={userId}
        canRestore={ADMIN_ROLES.includes(role)}
      />
    </div>
  );
}
