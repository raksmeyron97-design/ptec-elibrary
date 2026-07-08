import Pagination from "@/components/ui/core/Pagination";
import PostStats from "@/components/admin/posts/PostStats";
import PostToolbar from "@/components/admin/posts/PostToolbar";
import PostFilters from "@/components/admin/posts/PostFilters";
import PostsListClient from "@/components/admin/posts/PostsListClient";
import PostErrorState from "@/components/admin/posts/PostErrorState";
import { getPosts, getPostsSummary, getPostAuthors } from "@/lib/admin/posts";

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  category?: string;
  status?: string;
  authorId?: string;
  dateRange?: string;
  dateFrom?: string;
  dateTo?: string;
  minViews?: string;
  maxViews?: string;
  sort?: string;
  page?: string;
};

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [postsResult, summary, authors] = await Promise.all([
    getPosts({
      q: sp.q,
      category: sp.category,
      status: sp.status,
      authorId: sp.authorId,
      dateRange: (sp.dateRange as never) ?? "all",
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      minViews: sp.minViews ? Number(sp.minViews) : undefined,
      maxViews: sp.maxViews ? Number(sp.maxViews) : undefined,
      sort: sp.sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    getPostsSummary(),
    getPostAuthors(),
  ]);

  const totalPages = Math.max(1, Math.ceil(postsResult.total / PAGE_SIZE));
  const hasActiveFilters = Boolean(
    sp.q || sp.category || sp.status || sp.authorId || (sp.dateRange && sp.dateRange !== "all") || sp.minViews || sp.maxViews,
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-heading">Manage Posts</h1>
        <p className="text-sm text-text-muted">Create, edit, and publish your library posts.</p>
      </div>

      <PostStats summary={summary} />

      <PostToolbar totalItems={postsResult.total} />

      <PostFilters
        value={{
          category: sp.category ?? "",
          status: sp.status ?? "",
          dateRange: sp.dateRange ?? "all",
          dateFrom: sp.dateFrom ?? "",
          dateTo: sp.dateTo ?? "",
          authorId: sp.authorId ?? "",
          minViews: sp.minViews ?? "",
          maxViews: sp.maxViews ?? "",
          sort: sp.sort ?? "newest",
        }}
        authors={authors}
        hasActiveFilters={hasActiveFilters}
      />

      {postsResult.error ? (
        <PostErrorState />
      ) : (
        <PostsListClient
          rows={postsResult.rows}
          rowNumberOffset={(page - 1) * PAGE_SIZE}
          hasAnyPostsAtAll={summary.total > 0}
        />
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={postsResult.total}
        pageSize={PAGE_SIZE}
        searchParams={sp as Record<string, string | undefined>}
        basePath="/admin/posts"
      />
    </div>
  );
}
