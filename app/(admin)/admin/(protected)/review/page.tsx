import { ClipboardCheck } from "lucide-react";
import { getReviewQueue } from "@/app/actions/review";
import ReviewQueueClient from "./ReviewQueueClient";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const items = await getReviewQueue();
  const pendingCount = items.filter((i) => i.status === "pending_review").length;

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <ClipboardCheck className="h-6 w-6 text-brand" />
            <h1 className="text-[22px] font-bold text-text-heading">Review Queue</h1>
            {pendingCount > 0 && (
              <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-text-muted">
            Books and theses submitted for review. Approving publishes them immediately.
          </p>
        </div>
      </div>

      <ReviewQueueClient items={items} />
    </div>
  );
}
