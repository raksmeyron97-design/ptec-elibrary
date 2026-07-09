import Link from "next/link";
import { BookOpen, SearchX, Plus } from "lucide-react";

export function EbookEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-divider bg-paper text-text-muted">
        <BookOpen className="h-6 w-6" />
      </span>
      <p className="text-base font-bold text-text-heading">No e-books yet</p>
      <p className="mt-1.5 max-w-sm text-sm text-text-muted">
        Upload your first e-book to start building the PTEC Library.
      </p>
      <Link
        href="/admin/upload"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover"
      >
        <Plus className="h-4 w-4" /> Upload E-book
      </Link>
    </div>
  );
}

export function EbookNoResultsState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-divider bg-paper text-text-muted">
        <SearchX className="h-6 w-6" />
      </span>
      <p className="text-base font-bold text-text-heading">No e-books found</p>
      <p className="mt-1.5 max-w-sm text-sm text-text-muted">Try changing your search or filters.</p>
      <Link
        href="/admin/manage"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper"
      >
        Clear filters
      </Link>
    </div>
  );
}
