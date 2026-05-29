"use client";

// app/admin/posts/PostsClient.tsx
import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePost, togglePublish } from "@/app/(admin)/admin/(protected)/posts/actions";

type PostRow = {
  id: string;
  title: string;
  slug: string;
  category: string;
  author: string;
  isPublished: boolean;
  views: number;
  createdAt: string | null;
};

const PAGE_SIZE = 20;
const CATEGORIES = ["All", "Research", "Announcement", "Event", "Journal", "Other"] as const;

const categoryStyles: Record<string, string> = {
  Research:     "bg-cyan-50 text-cyan-700",
  Announcement: "bg-violet-50 text-violet-700",
  Event:        "bg-orange-50 text-orange-700",
  Journal:      "bg-blue-50 text-blue-700",
  Other:        "bg-slate-100 text-slate-600",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PostsClient({ posts }: { posts: PostRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery]             = useState("");
  const [activeCat, setActiveCat]     = useState<(typeof CATEGORIES)[number]>("All");
  const [page, setPage]               = useState(1);
  const [confirmId, setConfirmId]     = useState<string | null>(null);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [togglingId, setTogglingId]   = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Filter (search + category) ────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return posts.filter((p) => {
      const matchesCat = activeCat === "All" || p.category === activeCat;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [posts, query, activeCat]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const slice      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearch(v: string) {
    setQuery(v);
    setPage(1);
  }

  function handleCategory(c: (typeof CATEGORIES)[number]) {
    setActiveCat(c);
    setPage(1);
  }

  // ── Delete ────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id);
    setActionError(null);
    try {
      await deletePost(id);
      startTransition(() => router.refresh());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  // ── Toggle publish ────────────────────────────────────────────
  async function handleToggle(id: string, current: boolean) {
    setTogglingId(id);
    setActionError(null);
    try {
      await togglePublish(id, !current);
      startTransition(() => router.refresh());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">

      {/* ── Top Action Bar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search bar */}
        <div className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by title, author, category…"
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

        {/* Create Post Button */}
        <Link
          href="/admin/posts/new"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#007c91] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#00687a]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14m-7-7h14"/>
          </svg>
          Create Post
        </Link>
      </div>

      {/* ── Category filter ── */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => handleCategory(c)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeCat === c
                ? "bg-[#007c91] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* ── Action error ── */}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
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
                <th className="px-4 py-3 hidden md:table-cell">Category</th>
                <th className="px-4 py-3 hidden lg:table-cell">Author</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 hidden xl:table-cell text-right">Views</th>
                <th className="px-4 py-3 hidden lg:table-cell">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {slice.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    No posts found{query ? ` for "${query}"` : ""}.
                  </td>
                </tr>
              ) : (
                slice.map((post, idx) => {
                  const rowNum = (safePage - 1) * PAGE_SIZE + idx + 1;
                  const isDeleting   = deletingId === post.id;
                  const isConfirming = confirmId === post.id;
                  const isToggling   = togglingId === post.id;

                  return (
                    <tr
                      key={post.id}
                      className={`transition-colors hover:bg-slate-50/80 ${isDeleting ? "opacity-40" : ""}`}
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-xs text-slate-400 tabular-nums">{rowNum}</td>

                      {/* Title */}
                      <td className="px-4 py-3 max-w-[260px]">
                        <Link
                          href={`/posts/${post.slug}`}
                          className="font-semibold text-slate-800 hover:text-[#007c91] line-clamp-2 leading-snug"
                          target="_blank"
                        >
                          {post.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-400 md:hidden">{post.category}</p>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${categoryStyles[post.category] ?? categoryStyles.Other}`}>
                          {post.category}
                        </span>
                      </td>

                      {/* Author */}
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-600 max-w-[160px] truncate">
                        {post.author}
                      </td>

                      {/* Status (clickable toggle) */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggle(post.id, post.isPublished)}
                          disabled={isToggling || isDeleting}
                          title={post.isPublished ? "Click to unpublish" : "Click to publish"}
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition disabled:opacity-50 ${
                            post.isPublished
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                          }`}
                        >
                          {isToggling ? "…" : post.isPublished ? "Live" : "Draft"}
                        </button>
                      </td>

                      {/* Views */}
                      <td className="px-4 py-3 hidden xl:table-cell text-right tabular-nums">
                        {post.views > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                            <svg className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                            {post.views >= 1000
                              ? `${(post.views / 1000).toFixed(1)}K`
                              : post.views}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs tabular-nums">
                        {formatDate(post.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {isConfirming ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-slate-500">Delete?</span>
                            <button
                              onClick={() => handleDelete(post.id)}
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
                              href={`/admin/posts/edit/${post.id}`}
                              className="rounded bg-[#0a1629] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#007c91]"
                            >
                              Edit
                            </Link>
                            <button
                              onClick={() => setConfirmId(post.id)}
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