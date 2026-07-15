"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import PostActionsMenu from "@/components/admin/posts/PostActionsMenu";
import { CATEGORY_BADGE_STYLES, STATUS_BADGE_STYLES, STATUS_LABELS, type PostListRow } from "@/lib/admin/posts-shared";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type RowActions = {
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDeleteRequest: (id: string, title: string) => void;
};

export default function PostsTable({
  rows,
  rowNumberOffset,
  selectedIds,
  allSelected,
  busyId,
  onToggleSelect,
  onToggleSelectAll,
  ...actions
}: RowActions & {
  rows: PostListRow[];
  rowNumberOffset: number;
  selectedIds: Set<string>;
  allSelected: boolean;
  busyId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}) {
  return (
    <div className="hidden rounded-xl border border-divider bg-bg-surface shadow-sm md:block">
      <div className="">
        <table className="w-full text-sm">
          <caption className="sr-only">Posts list</caption>
          <thead>
            <tr className="border-b border-divider bg-paper text-left text-xs font-bold uppercase tracking-wide text-text-muted [&>th:first-child]:rounded-tl-xl [&>th:last-child]:rounded-tr-xl">
              <th scope="col" className="w-10 px-4 py-3">
                <label className="sr-only" htmlFor="select-all-posts">Select all posts</label>
                <input
                  id="select-all-posts"
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30"
                />
              </th>
              <th scope="col" className="px-4 py-3">#</th>
              <th scope="col" className="px-4 py-3">Title</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">Category</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">Author</th>
              <th scope="col" className="px-4 py-3 text-center">Status</th>
              <th scope="col" className="hidden px-4 py-3 text-right xl:table-cell">Views</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">Created</th>
              <th scope="col" className="hidden px-4 py-3 xl:table-cell">Updated</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {rows.map((post, idx) => {
              const isSelected = selectedIds.has(post.id);
              const isBusy = busyId === post.id;
              return (
                <tr
                  key={post.id}
                  className={`transition-colors hover:bg-paper/80 ${isBusy ? "opacity-50" : ""} ${isSelected ? "bg-brand/5" : ""}`}
                >
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`select-post-${post.id}`}>Select {post.title}</label>
                    <input
                      id={`select-post-${post.id}`}
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(post.id)}
                      className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30"
                    />
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-text-muted">{rowNumberOffset + idx + 1}</td>
                  <td className="max-w-[320px] px-4 py-3">
                    <Link
                      href={`/posts/${post.slug}`}
                      target="_blank"
                      title={post.title}
                      className="font-semibold leading-relaxed text-text-heading hover:text-brand line-clamp-2"
                    >
                      {post.title}
                    </Link>
                    {post.excerpt && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{post.excerpt}</p>
                    )}
                    <p className="mt-0.5 text-xs text-text-muted lg:hidden">{post.category} · {post.author}</p>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE_STYLES[post.category] ?? CATEGORY_BADGE_STYLES.Other}`}>
                      {post.category}
                    </span>
                  </td>
                  <td className="hidden max-w-[160px] truncate px-4 py-3 text-text-body lg:table-cell">{post.author}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE_STYLES[post.status]}`}>
                      {STATUS_LABELS[post.status]}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums xl:table-cell">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-body">
                      <Eye className="h-3 w-3 text-text-muted" />
                      {post.views >= 1000 ? `${(post.views / 1000).toFixed(1)}K` : post.views}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-xs tabular-nums text-text-muted lg:table-cell">{formatDate(post.createdAt)}</td>
                  <td className="hidden px-4 py-3 text-xs tabular-nums text-text-muted xl:table-cell">{formatDate(post.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <PostActionsMenu
                      post={post}
                      busy={isBusy}
                      onPublish={() => actions.onPublish(post.id)}
                      onUnpublish={() => actions.onUnpublish(post.id)}
                      onArchive={() => actions.onArchive(post.id)}
                      onDuplicate={() => actions.onDuplicate(post.id)}
                      onDelete={() => actions.onDeleteRequest(post.id, post.title)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
