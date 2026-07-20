"use client";

import { useTranslations } from "next-intl";
import { useToast } from "@/components/admin/kit";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BulkActionBar from "@/components/admin/posts/BulkActionBar";
import PostsTable from "@/components/admin/posts/PostsTable";
import PostMobileCard from "@/components/admin/posts/PostMobileCard";
import DeletePostDialog, { type DeleteTarget } from "@/components/admin/posts/DeletePostDialog";
import { PostEmptyState, PostNoResultsState } from "@/components/admin/posts/PostEmptyState";
import type { PostListRow } from "@/lib/admin/posts-shared";
import {
  publishPost,
  unpublishPost,
  archivePost,
  duplicatePost,
  deletePost,
  bulkUpdatePosts,
  type BulkPostAction,
} from "@/app/(admin)/admin/(protected)/posts/actions";

export default function PostsListClient({
  rows,
  rowNumberOffset,
  hasAnyPostsAtAll,
}: {
  rows: PostListRow[];
  rowNumberOffset: number;
  /** Distinguishes "zero posts ever created" from "zero posts match the current filters". */
  hasAnyPostsAtAll: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("adminPosts.toasts");
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function runRowAction(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      toast.success(t("updated"));
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function runBulkAction(action: BulkPostAction, payload?: { category?: string }) {
    setBulkBusy(true);
    try {
      await bulkUpdatePosts(Array.from(selectedIds), action, payload);
      setSelectedIds(new Set());
      toast.success(t("updated"));
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("bulkFailed"));
    } finally {
      setBulkBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBulkBusy(true);
    try {
      if (deleteTarget.kind === "single") {
        await deletePost(deleteTarget.id);
      } else {
        await bulkUpdatePosts(deleteTarget.ids, "delete");
        setSelectedIds(new Set());
      }
      setDeleteTarget(null);
      toast.success(t("deleted"));
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteFailed"));
    } finally {
      setBulkBusy(false);
    }
  }

  if (rows.length === 0) {
    return hasAnyPostsAtAll ? <PostNoResultsState /> : <PostEmptyState />;
  }

  const rowActions = {
    onPublish: (id: string) => runRowAction(id, () => publishPost(id)),
    onUnpublish: (id: string) => runRowAction(id, () => unpublishPost(id)),
    onArchive: (id: string) => runRowAction(id, () => archivePost(id)),
    onDuplicate: (id: string) => runRowAction(id, () => duplicatePost(id)),
    onDeleteRequest: (id: string, title: string) => setDeleteTarget({ kind: "single", id, title }),
  };

  return (
    <div className="space-y-4">
      <BulkActionBar
        count={selectedIds.size}
        busy={bulkBusy}
        onPublish={() => runBulkAction("publish")}
        onUnpublish={() => runBulkAction("unpublish")}
        onChangeCategory={(category) => runBulkAction("category", { category })}
        onArchive={() => runBulkAction("archive")}
        onDelete={() => setDeleteTarget({ kind: "bulk", ids: Array.from(selectedIds) })}
        onClear={() => setSelectedIds(new Set())}
      />

      <PostsTable
        rows={rows}
        rowNumberOffset={rowNumberOffset}
        selectedIds={selectedIds}
        allSelected={selectedIds.size > 0 && selectedIds.size === rows.length}
        busyId={busyId}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        {...rowActions}
      />
      <PostMobileCard
        rows={rows}
        selectedIds={selectedIds}
        busyId={busyId}
        onToggleSelect={toggleSelect}
        {...rowActions}
      />

      {deleteTarget && (
        <DeletePostDialog
          target={deleteTarget}
          busy={bulkBusy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
