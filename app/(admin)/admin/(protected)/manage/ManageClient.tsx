"use client";

// app/admin/manage/ManageClient.tsx
import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteBook } from "@/app/(admin)/admin/(protected)/actions";

type BookRow = {
  id: string;
  title: string;
  slug: string;
  author: string;
  category: string;
  department: string;
  language: string;
  year: number | null;
  isPublished: boolean;
  fileSizeKb: number | null;
  downloadCount: number; // ← NEW
};

const PAGE_SIZE = 20;

export default function ManageClient({ books }: { books: BookRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery]           = useState("");
  const [page, setPage]             = useState(1);
  const [confirmId, setConfirmId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Filter ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.department.toLowerCase().includes(q)
    );
  }, [books, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const slice      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearch(v: string) {
    setQuery(v);
    setPage(1);
  }

  // ── Delete ────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteBook(id);
      startTransition(() => router.refresh());
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-4">

      {/* ── Search bar ── */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by title, author, category, department…"
          className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
        />
        {query && (
          <button onClick={() => handleSearch("")} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        )}
        <span className="text-xs text-slate-400">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Delete error ── */}
      {deleteError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3 hidden md:table-cell">Author</th>
                <th className="px-4 py-3 hidden lg:table-cell">Department</th>
                <th className="px-4 py-3 hidden lg:table-cell">Year</th>
                <th className="px-4 py-3 hidden xl:table-cell">Size</th>
                {/* ── NEW column ── */}
                <th className="px-4 py-3 hidden xl:table-cell text-right">Downloads</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {slice.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                    No books found{query ? ` for "${query}"` : ""}.
                  </td>
                </tr>
              ) : (
                slice.map((book, idx) => {
                  const rowNum = (safePage - 1) * PAGE_SIZE + idx + 1;
                  const isDeleting = deletingId === book.id;
                  const isConfirming = confirmId === book.id;

                  return (
                    <tr
                      key={book.id}
                      className={`transition-colors hover:bg-slate-50/80 ${isDeleting ? "opacity-40" : ""}`}
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-xs text-slate-400 tabular-nums">{rowNum}</td>

                      {/* Title */}
                      <td className="px-4 py-3 max-w-[240px]">
                        <Link
                          href={`/books/${book.slug}`}
                          className="font-semibold text-slate-800 hover:text-[#007c91] line-clamp-2 leading-snug"
                          target="_blank"
                        >
                          {book.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-400 md:hidden">{book.author}</p>
                      </td>

                      {/* Author */}
                      <td className="px-4 py-3 hidden md:table-cell text-slate-600 max-w-[160px] truncate">
                        {book.author}
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {book.department}
                        </span>
                      </td>

                      {/* Year */}
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-500 tabular-nums">
                        {book.year ?? "—"}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3 hidden xl:table-cell text-slate-400 text-xs tabular-nums">
                        {book.fileSizeKb
                          ? book.fileSizeKb >= 1024
                            ? `${(book.fileSizeKb / 1024).toFixed(1)} MB`
                            : `${book.fileSizeKb} KB`
                          : "—"}
                      </td>

                      {/* Downloads ── NEW */}
                      <td className="px-4 py-3 hidden xl:table-cell text-right tabular-nums">
                        {book.downloadCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                            <svg className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 3v13m0 0-4-4m4 4 4-4"/><path d="M4 20h16"/>
                            </svg>
                            {book.downloadCount >= 1000
                              ? `${(book.downloadCount / 1000).toFixed(1)}K`
                              : book.downloadCount}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
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
                            <span className="text-xs text-slate-500">Delete?</span>
                            <button
                              onClick={() => handleDelete(book.id)}
                              disabled={isDeleting}
                              className="rounded bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {isDeleting ? "…" : "Yes"}
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/edit/${book.id}`}
                              className="rounded bg-[#0a1629] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#007c91]"
                            >
                              Edit
                            </Link>
                            <button
                              onClick={() => setConfirmId(book.id)}
                              disabled={isDeleting}
                              className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                            >
                              Delete
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

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <p className="text-xs text-slate-500">
            Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
            {" · "}
            showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex gap-1.5">
            <button onClick={() => setPage(1)} disabled={safePage === 1}
              className="h-8 w-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
              className="h-8 w-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">‹</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-xs text-slate-400">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    className={`h-8 min-w-[2rem] rounded-lg border px-2 text-xs font-bold transition ${
                      safePage === p ? "border-[#007c91] bg-[#007c91] text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}>{p}</button>
                )
              )}

            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="h-8 w-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">›</button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              className="h-8 w-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">»</button>
          </div>
        </div>
      )}
    </div>
  );
}