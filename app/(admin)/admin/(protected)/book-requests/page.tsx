import { BookPlus } from "lucide-react";
import { adminGetBookRequests } from "@/app/actions/book-requests";
import BookRequestsClient from "./BookRequestsClient";

export const dynamic = "force-dynamic";

export default async function BookRequestsPage() {
  const requests = await adminGetBookRequests();
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <BookPlus className="h-6 w-6 text-brand" />
            <h1 className="text-[22px] font-bold text-text-heading">Book Requests</h1>
            {pendingCount > 0 && (
              <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-text-muted">
            Review and manage book requests submitted by users.
          </p>
        </div>
      </div>

      <BookRequestsClient requests={requests} />
    </div>
  );
}
