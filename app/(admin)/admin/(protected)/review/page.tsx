import { getTranslations } from "next-intl/server";
import { getReviewQueues, getReviewerOptions, type ReviewItem } from "@/app/actions/review";
import { ADMIN_ROLES } from "@/lib/types/roles";
import { PageHeader, StatusBadge } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import type { CanonicalStatus } from "@/lib/content-status";
import ReviewQueueClient, { type QueueTab } from "./_components/ReviewQueueClient";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export const dynamic = "force-dynamic";

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

type SP = { tab?: string; status?: string; page?: string; size?: string };

/**
 * Queue state lives in the URL (tab / status / page / size) rather than in the
 * client, so a reviewer working a long backlog can bookmark, share and — the
 * one that actually bites — come back after editing a record without losing
 * their place. Slicing happens here; the client component receives one page
 * and is remounted per view (see the `key` below) so its optimistic removals
 * never outlive the list they were made against.
 */
export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  /* READ, not write. The queue is where a reviewer *looks* at what is waiting:
     the backlog, each submission's metadata, its validation state and its
     publish blockers. Every mutation on it — approve, reject, assign, verify —
     is a separate `books: write` check inside the action, so a `books: read`
     account gets the whole picture and none of the buttons. Gating the page on
     write, as it was, hid the work from the people who triage it. */
  const { userId, role, can } = await requireRouteAccess("books.review");

  const sp = await searchParams;
  const [t, queues, reviewers] = await Promise.all([
    getTranslations("adminReview"),
    getReviewQueues(),
    /* Only fetched when it can be used: the assign dropdown is a write action,
       and listing colleagues to a read-only viewer is a needless disclosure.
       Either collection's write permission qualifies, matching the action's own
       gate — the queue mixes books and theses. */
    can("books.review.assign") || can("research.review.assign")
      ? getReviewerOptions()
      : Promise.resolve([]),
  ]);

  const actionable = queues.pending.filter(
    (i) => i.status === "needs_review" || i.status === "in_review" || i.status === "imported",
  ).length;

  // No ?tab= yet: open the queue that has work, preferring the one nobody
  // knows about when the pending queue is clear.
  const tab: QueueTab =
    sp.tab === "unverified"
      ? "unverifiedLive"
      : sp.tab === "pending"
        ? "pending"
        : queues.pending.length === 0 && queues.unverifiedLive.length > 0
          ? "unverifiedLive"
          : "pending";

  // Status counts come from the whole pending queue, never from the page
  // slice — a filter pill reading "(3)" while showing 10 rows is a bug.
  const statusCounts = (() => {
    const present = new Map<CanonicalStatus, number>();
    for (const item of queues.pending) present.set(item.status, (present.get(item.status) ?? 0) + 1);
    return [
      { value: "all" as const, count: queues.pending.length },
      ...[...present.entries()].map(([value, count]) => ({ value, count })),
    ];
  })();

  const statusFilter =
    tab === "pending" && sp.status && statusCounts.some((s) => s.value === sp.status)
      ? sp.status
      : "all";

  const source: ReviewItem[] = tab === "pending" ? queues.pending : queues.unverifiedLive;
  const filtered = statusFilter === "all" ? source : source.filter((i) => i.status === statusFilter);

  const requestedSize = Number(sp.size);
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(sp.page ?? "1") || 1), totalPages);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="w-full space-y-6">
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
        key={`${tab}-${statusFilter}-${page}-${pageSize}`}
        items={visible}
        tab={tab}
        statusFilter={statusFilter}
        statusCounts={statusCounts}
        tabCounts={{ pending: queues.pending.length, unverifiedLive: queues.unverifiedLive.length }}
        size={PAGE_SIZE_OPTIONS.includes(requestedSize) ? String(requestedSize) : undefined}
        unverifiedLiveCapped={queues.unverifiedLiveCapped}
        reviewers={reviewers}
        viewerId={userId}
        canRestore={ADMIN_ROLES.includes(role)}
        /* Per collection, not per page: the queue mixes books and theses, and
           `books: write` says nothing about a thesis. A viewer with one and not
           the other gets action buttons on exactly the half they own. */
        canWriteBooks={can("books.review.approve")}
        canWriteResearch={can("research.review.approve")}
      />
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageSize={pageSize}
        searchParams={sp as Record<string, string | undefined>}
        basePath="/admin/review"
        pageSizeOptions={PAGE_SIZE_OPTIONS}
      />
    </div>
  );
}
