"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Eye } from "lucide-react";
import PostActionsMenu from "@/components/admin/posts/PostActionsMenu";
import { CATEGORY_BADGE_STYLES, STATUS_BADGE_STYLES, STATUS_LABELS, type PostListRow } from "@/lib/admin/posts-shared";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function PostMobileCard({
  rows,
  selectedIds,
  busyId,
  onToggleSelect,
  onPublish,
  onUnpublish,
  onArchive,
  onDuplicate,
  onDeleteRequest,
}: {
  rows: PostListRow[];
  selectedIds: Set<string>;
  busyId: string | null;
  onToggleSelect: (id: string) => void;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDeleteRequest: (id: string, title: string) => void;
}) {
  const t = useTranslations("adminPosts.table");
  const tStatus = useTranslations("adminPosts.status");
  return (
    <div className="space-y-3 md:hidden">
      {rows.map((post) => {
        const isSelected = selectedIds.has(post.id);
        const isBusy = busyId === post.id;
        return (
          <div
            key={post.id}
            className={`rounded-xl border p-4 shadow-sm transition ${isSelected ? "border-brand/40 bg-brand/5" : "border-divider bg-bg-surface"} ${isBusy ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(post.id)}
                aria-label={t("selectOne", { title: post.title })}
                className="mt-1 h-4 w-4 shrink-0 rounded border-divider text-brand focus:ring-focus-ring/30"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/posts/${post.slug}`}
                  target="_blank"
                  title={post.title}
                  className="font-semibold leading-relaxed text-text-heading hover:text-brand line-clamp-2"
                >
                  {post.title}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE_STYLES[post.category] ?? CATEGORY_BADGE_STYLES.Other}`}>
                    {post.category}
                  </span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE_STYLES[post.status]}`}>
                    {STATUS_LABELS[post.status] ? tStatus(post.status) : post.status}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs text-text-muted">
                  <dt className="font-semibold text-text-body">{t("author")}</dt>
                  <dd className="text-right truncate">{post.author}</dd>
                  <dt className="font-semibold text-text-body">{t("views")}</dt>
                  <dd className="flex items-center justify-end gap-1 text-right">
                    <Eye className="h-3 w-3" /> {post.views.toLocaleString()}
                  </dd>
                  <dt className="font-semibold text-text-body">{t("created")}</dt>
                  <dd className="text-right">{formatDate(post.createdAt)}</dd>
                </dl>
              </div>
              <PostActionsMenu
                post={post}
                busy={isBusy}
                onPublish={() => onPublish(post.id)}
                onUnpublish={() => onUnpublish(post.id)}
                onArchive={() => onArchive(post.id)}
                onDuplicate={() => onDuplicate(post.id)}
                onDelete={() => onDeleteRequest(post.id, post.title)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
