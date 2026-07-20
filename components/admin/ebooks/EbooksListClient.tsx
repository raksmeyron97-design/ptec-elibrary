"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/admin/kit";
import BulkEbookActionBar from "@/components/admin/ebooks/BulkEbookActionBar";
import EbooksTable from "@/components/admin/ebooks/EbooksTable";
import EbookMobileCard from "@/components/admin/ebooks/EbookMobileCard";
import DeleteEbookDialog, { type DeleteTarget } from "@/components/admin/ebooks/DeleteEbookDialog";
import ArchiveEbookDialog, { type ArchiveTarget } from "@/components/admin/ebooks/ArchiveEbookDialog";
import { EbookEmptyState, EbookNoResultsState } from "@/components/admin/ebooks/states/EbookEmptyState";
import type { EbookListRow, EbookOption } from "@/lib/admin/ebooks-shared";
import {
  publishEbook,
  unpublishEbook,
  archiveEbook,
  restoreEbook,
  deleteEbook,
  bulkUpdateEbooks,
  type BulkEbookAction,
} from "@/app/actions/ebooks";

function toCsvValue(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: EbookListRow[]) {
  const header = ["Title", "Author", "Department", "Category", "Year", "Language", "Status", "File Size (KB)", "Views", "Downloads", "Created At"];
  const lines = rows.map((r) => [
    r.title,
    r.author,
    r.department,
    r.category,
    r.year,
    r.language,
    r.status,
    r.fileSizeKb,
    r.viewCount,
    r.downloadCount,
    r.createdAt,
  ].map(toCsvValue).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ebooks-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EbooksListClient({
  rows,
  departments,
  hasAnyEbooksAtAll,
}: {
  rows: EbookListRow[];
  departments: EbookOption[];
  /** Distinguishes "zero e-books ever uploaded" from "zero e-books match the current filters". */
  hasAnyEbooksAtAll: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("adminEbooks.toasts");
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);

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

  async function runRowAction(id: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusyId(id);
    try {
      const result = await fn();
      if (!result.success) {
        toast.error(result.error ?? t("failed"));
      } else {
        toast.success(t("updated"));
        startTransition(() => router.refresh());
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function runBulkAction(action: BulkEbookAction, payload?: { departmentId?: string; tag?: string }) {
    setBulkBusy(true);
    try {
      const result = await bulkUpdateEbooks(Array.from(selectedIds), action, payload);
      if (result.error) toast.error(result.error);
      else toast.success(t("updated"));
      setSelectedIds(new Set());
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
        const result = await deleteEbook(deleteTarget.id);
        if (!result.success) throw new Error(result.error ?? t("deleteFailed"));
      } else {
        const result = await bulkUpdateEbooks(deleteTarget.ids, "delete");
        if (result.error) toast.error(result.error);
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

  async function confirmArchive() {
    if (!archiveTarget) return;
    setBulkBusy(true);
    try {
      if (archiveTarget.kind === "single") {
        const result = await archiveEbook(archiveTarget.id);
        if (!result.success) throw new Error(result.error ?? t("archiveFailed"));
      } else {
        const result = await bulkUpdateEbooks(archiveTarget.ids, "archive");
        if (result.error) toast.error(result.error);
        setSelectedIds(new Set());
      }
      setArchiveTarget(null);
      toast.success(t("archived"));
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("archiveFailed"));
    } finally {
      setBulkBusy(false);
    }
  }

  if (rows.length === 0) {
    return hasAnyEbooksAtAll ? <EbookNoResultsState /> : <EbookEmptyState />;
  }

  const rowActions = {
    onPublish: (id: string) => runRowAction(id, () => publishEbook(id)),
    onUnpublish: (id: string) => runRowAction(id, () => unpublishEbook(id)),
    onArchive: (id: string) => {
      const book = rows.find((r) => r.id === id);
      setArchiveTarget({ kind: "single", id, title: book?.title ?? "this e-book" });
    },
    onRestore: (id: string) => runRowAction(id, () => restoreEbook(id)),
    onDeleteRequest: (id: string, title: string) => setDeleteTarget({ kind: "single", id, title }),
  };

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));

  return (
    <div className="space-y-4">
      <BulkEbookActionBar
        count={selectedIds.size}
        busy={bulkBusy}
        departments={departments}
        onPublish={() => runBulkAction("publish")}
        onUnpublish={() => runBulkAction("unpublish")}
        onChangeDepartment={(departmentId) => runBulkAction("department", { departmentId })}
        onAddTag={(tag) => runBulkAction("addTag", { tag })}
        onArchive={() => setArchiveTarget({ kind: "bulk", ids: Array.from(selectedIds) })}
        onDelete={() => setDeleteTarget({ kind: "bulk", ids: Array.from(selectedIds) })}
        onExportCsv={() => exportCsv(selectedRows.length ? selectedRows : rows)}
        onClear={() => setSelectedIds(new Set())}
      />

      <EbooksTable
        rows={rows}
        selectedIds={selectedIds}
        allSelected={selectedIds.size > 0 && selectedIds.size === rows.length}
        busyId={busyId}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        {...rowActions}
      />
      <EbookMobileCard
        rows={rows}
        selectedIds={selectedIds}
        busyId={busyId}
        onToggleSelect={toggleSelect}
        {...rowActions}
      />

      {deleteTarget && (
        <DeleteEbookDialog
          target={deleteTarget}
          busy={bulkBusy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {archiveTarget && (
        <ArchiveEbookDialog
          target={archiveTarget}
          busy={bulkBusy}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={confirmArchive}
        />
      )}
    </div>
  );
}
