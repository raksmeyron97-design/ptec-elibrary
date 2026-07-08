import Link from "next/link";
import { FileText, SearchX, Plus } from "lucide-react";

export function PostEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-divider bg-paper text-text-muted">
        <FileText className="h-6 w-6" />
      </span>
      <p className="text-base font-bold text-text-heading">No posts yet</p>
      <p className="mt-1.5 max-w-sm text-sm text-text-muted">
        Create your first post to share announcements, events, and research updates.
      </p>
      <Link
        href="/admin/posts/new"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover"
      >
        <Plus className="h-4 w-4" /> Create Post
      </Link>
    </div>
  );
}

export function PostNoResultsState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-divider bg-paper text-text-muted">
        <SearchX className="h-6 w-6" />
      </span>
      <p className="text-base font-bold text-text-heading">No posts found</p>
      <p className="mt-1.5 max-w-sm text-sm text-text-muted">Try changing your search or filters.</p>
      <Link
        href="/admin/posts"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper"
      >
        Clear filters
      </Link>
    </div>
  );
}
