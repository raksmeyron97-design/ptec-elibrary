import { ClipboardCheck } from "lucide-react";
import { getReviewQueue, getReviewerOptions } from "@/app/actions/review";
import { requireLibrarian } from "@/lib/auth/requireAdmin";
import { ADMIN_ROLES } from "@/lib/types/roles";
import ReviewQueueClient from "./ReviewQueueClient";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const [{ userId, role }, items, reviewers] = await Promise.all([
    requireLibrarian(),
    getReviewQueue(),
    getReviewerOptions(),
  ]);
  const actionable = items.filter(
    (i) => i.status === "needs_review" || i.status === "in_review" || i.status === "imported",
  ).length;

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <ClipboardCheck className="h-6 w-6 text-brand" />
            <h1 className="text-[22px] font-bold text-text-heading">Review Queue</h1>
            {actionable > 0 && (
              <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">
                {actionable} waiting
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-text-muted">
            Books and theses in the verification workflow. Approving verifies the metadata and
            publishes; “verify only” marks it checked without publishing. Editors cannot verify
            their own records.
          </p>
        </div>
      </div>

      <ReviewQueueClient
        items={items}
        reviewers={reviewers}
        viewerId={userId}
        canRestore={ADMIN_ROLES.includes(role)}
      />
    </div>
  );
}
