"use client"
 
;
/* eslint-disable @next/next/no-img-element */


// app/admin/manage/ManageClient.tsx
import { useState, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteBook } from "@/app/(admin)/admin/(protected)/actions";
import Icon from "@/components/ui/core/Icon";

type BookRow = {
  id: string;
  title: string;
  slug: string;
  coverUrl: string | null;
  author: string;
  category: string;
  department: string;
  language: string;
  year: number | null;
  isPublished: boolean;
  fileSizeKb: number | null;
  downloadCount: number;
};

type Filters = { q: string; dept: string; status: string; sort: string };

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "newest",     label: "Just uploaded" },
  { value: "oldest",     label: "Oldest first" },
  { value: "title",      label: "Title (A–Z)" },
  { value: "downloads",  label: "Most downloaded" },
  { value: "department", label: "Department" },
  { value: "category",   label: "Category" },
];

export default function ManageClient({
  books,
  departments,
  currentPage,
  pageSize,
  totalItems,
  filters,
}: {
  books: BookRow[];
  departments: string[];
  currentPage: number;
  pageSize: number;
  totalItems: number;
  filters: Filters;
}) {
  const router    = useRouter();
  const pathname  = usePathname();
  const params    = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Local mirror of the search box so typing feels instant; URL updates debounced.
  const [queryText, setQueryText] = useState(filters.q);

  const [confirmId, setConfirmId]     = useState<string | null>(null);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── URL helpers ───────────────────────────────────────────────
  const setParams = useCallback(
    (updates: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      });
      if (resetPage) next.delete("page");
      const qs = next.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [params, pathname, router]
  );

  // Debounced search → URL
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(v: string) {
    setQueryText(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setParams({ q: v || null }), 350);
  }
  function clearSearch() {
    setQueryText("");
    if (debRef.current) clearTimeout(debRef.current);
    setParams({ q: null });
  }

  const anyFilterActive =
    !!filters.q || !!filters.dept || !!filters.status || filters.sort !== "newest";

  function resetAll() {
    setQueryText("");
    startTransition(() => router.push(pathname));
  }

  // ── Delete ────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteBook(id);
      startTransition(() => router.refresh()); // stays on current page/filters
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  const selectCls =
    "rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body outline-none transition focus:border-brand focus:ring-1 focus:ring-focus-ring";

  return (
    <div className={`space-y-4 ${isPending ? "opacity-70" : ""}`}>

      {/* ── Toolbar: search + sort + filters ── */}
      <div className="rounded-xl border border-divider bg-bg-surface p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">

          {/* Search */}
          <div className="flex flex-1 items-center gap-3 rounded-lg border border-divider px-3 py-2">
            <svg className="h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={queryText}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by title…"
              className="flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none"
            />
            {queryText && (
              <button type="button">✕</button>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort */}
            <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
              Sort
              <select
                value={filters.sort}
                onChange={(e) => setParams({ sort: e.target.value })}
                className={selectCls}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            {/* Department filter */}
            <select
              value={filters.dept}
              onChange={(e) => setParams({ dept: e.target.value || null })}
              className={selectCls}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={filters.status}
              onChange={(e) => setParams({ status: e.target.value || null })}
              className={selectCls}
            >
              <option value="">All status</option>
              <option value="live">Live</option>
              <option value="draft">Draft</option>
            </select>

            {anyFilterActive && (
              <button type="button">
                Reset
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 px-1 text-xs text-text-muted">
          {totalItems} result{totalItems !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ── Delete error ── */}
      {deleteError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-paper text-left text-xs font-bold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3 w-16 text-center">Cover</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3 hidden md:table-cell">Author</th>
                <th className="px-4 py-3 hidden lg:table-cell">Department</th>
                <th className="px-4 py-3 hidden lg:table-cell">Year</th>
                <th className="px-4 py-3 hidden xl:table-cell">Size</th>
                <th className="px-4 py-3 hidden xl:table-cell text-right">Downloads</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {books.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-text-muted">
                    No books found{filters.q ? ` for "${filters.q}"` : ""}.
                  </td>
                </tr>
              ) : (
                books.map((book, idx) => {
                  const rowNum = (currentPage - 1) * pageSize + idx + 1;
                  const isDeleting = deletingId === book.id;
                  const isConfirming = confirmId === book.id;

                  return (
                    <tr
                      key={book.id}
                      className={`transition-colors hover:bg-paper/80 ${isDeleting ? "opacity-40" : ""}`}
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-xs text-text-muted tabular-nums">{rowNum}</td>

                      {/* Cover */}
                      <td className="px-4 py-3 text-center">
                        {book.coverUrl ? (
                          <img
                            src={book.coverUrl}
                            alt={`${book.title} cover`}
                            className="w-10 h-14 object-cover rounded shadow-sm mx-auto"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-paper rounded border border-divider flex items-center justify-center mx-auto text-text-muted">
                            <Icon name="library" className="w-5 h-5 opacity-50" />
                          </div>
                        )}
                      </td>

                      {/* Title */}
                      <td className="px-4 py-3 max-w-[240px]">
                        <Link
                          href={`/books/${book.slug}`}
                          className="font-semibold text-text-heading hover:text-brand line-clamp-2 leading-snug"
                          target="_blank"
                        >
                          {book.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-text-muted md:hidden">{book.author}</p>
                      </td>

                      {/* Author */}
                      <td className="px-4 py-3 hidden md:table-cell text-text-body max-w-[160px] truncate">
                        {book.author}
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="rounded-md bg-paper px-2 py-0.5 text-xs font-medium text-text-body">
                          {book.department}
                        </span>
                      </td>

                      {/* Year */}
                      <td className="px-4 py-3 hidden lg:table-cell text-text-muted tabular-nums">
                        {book.year ?? "—"}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3 hidden xl:table-cell text-text-muted text-xs tabular-nums">
                        {book.fileSizeKb
                          ? book.fileSizeKb >= 1024
                            ? `${(book.fileSizeKb / 1024).toFixed(1)} MB`
                            : `${book.fileSizeKb} KB`
                          : "—"}
                      </td>

                      {/* Downloads */}
                      <td className="px-4 py-3 hidden xl:table-cell text-right tabular-nums">
                        {book.downloadCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-body">
                            <svg className="h-3 w-3 text-text-muted" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 3v13m0 0-4-4m4 4 4-4" /><path d="M4 20h16" />
                            </svg>
                            {book.downloadCount >= 1000
                              ? `${(book.downloadCount / 1000).toFixed(1)}K`
                              : book.downloadCount}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            book.isPublished
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {book.isPublished ? "Live" : "Draft"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {isConfirming ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-text-muted">Delete?</span>
                            <button type="button" onClick={() => handleDelete(book.id)}
                              disabled={isDeleting}
                              className="rounded bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {isDeleting ? "…" : "Yes"}
                            </button>
                            <button type="button" onClick={() => setConfirmId(null)}
                              className="rounded bg-paper px-2.5 py-1 text-xs font-semibold text-text-body hover:bg-paper"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-3 text-text-muted">
                            <Link
                              href={`/admin/edit/${book.id}`}
                              className="hover:text-brand transition"
                              title="Edit"
                            >
                              <Icon name="edit" className="w-5 h-5" />
                            </Link>
                            <button type="button" onClick={() => setConfirmId(book.id)}
                              disabled={isDeleting}
                              className="hover:text-red-500 transition disabled:opacity-50"
                              title="Delete"
                            >
                              <Icon name="trash" className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}