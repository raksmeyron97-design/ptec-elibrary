"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast, ConfirmDialog } from "@/components/admin/kit";
import AnnouncementsTable from "./AnnouncementsTable";
import AnnouncementMobileCard from "./AnnouncementMobileCard";
import { AnnouncementNoResultsState } from "./AnnouncementEmptyState";
import type { AnnouncementListRow } from "@/lib/admin/announcements/shared";
import {
  requestApproval,
  cancelScheduledAnnouncement,
  pauseAnnouncement,
  archiveAnnouncement,
  duplicateAnnouncement,
  resendFailedDeliveriesAction,
  deleteAnnouncement,
  bulkUpdateAnnouncements,
  type BulkAnnouncementAction,
} from "@/app/(admin)/admin/(protected)/announcements/actions";

type DeleteTarget = { kind: "single"; id: string; name: string } | { kind: "bulk"; ids: string[] };

export default function AnnouncementsDashboardClient({ rows, rowNumberOffset }: { rows: AnnouncementListRow[]; rowNumberOffset: number }) {
  const router = useRouter();
  const t = useTranslations("adminAnnouncements.toasts");
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

  async function runBulkAction(action: BulkAnnouncementAction) {
    setBulkBusy(true);
    try {
      const result = await bulkUpdateAnnouncements(Array.from(selectedIds), action);
      setSelectedIds(new Set());
      if (result.failed > 0) toast.error(t("bulkPartial", { success: result.success, failed: result.failed }));
      else toast.success(t("updated"));
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
        await deleteAnnouncement(deleteTarget.id);
      } else {
        await bulkUpdateAnnouncements(deleteTarget.ids, "delete");
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

  if (rows.length === 0) return <AnnouncementNoResultsState />;

  const rowActions = {
    onRequestApproval: (id: string) => runRowAction(id, () => requestApproval(id)),
    onCancelSchedule: (id: string) => runRowAction(id, () => cancelScheduledAnnouncement(id)),
    onPause: (id: string) => runRowAction(id, () => pauseAnnouncement(id)),
    onArchive: (id: string) => runRowAction(id, () => archiveAnnouncement(id)),
    onDuplicate: (id: string) => runRowAction(id, async () => {
      const { id: newId } = await duplicateAnnouncement(id);
      router.push(`/admin/announcements/${newId}/edit`);
    }),
    onResendFailed: (id: string) => runRowAction(id, async () => {
      const { queued } = await resendFailedDeliveriesAction(id);
      if (queued === 0) toast.info(t("noRetryable"));
    }),
    onDeleteRequest: (id: string, name: string) => setDeleteTarget({ kind: "single", id, name }),
  };

  return (
    <div className="space-y-4">
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5">
          <span className="text-[13px] font-semibold text-text-heading">{t("selectedCount", { count: selectedIds.size })}</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" disabled={bulkBusy} onClick={() => runBulkAction("archive")} className="rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-50">
              {t("bulkArchive")}
            </button>
            <button type="button" disabled={bulkBusy} onClick={() => setDeleteTarget({ kind: "bulk", ids: Array.from(selectedIds) })} className="rounded-lg border border-danger/30 bg-bg-surface px-3 py-1.5 text-[13px] font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50">
              {t("bulkDelete")}
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-[13px] font-semibold text-text-muted hover:text-text-heading">
              {t("clearSelection")}
            </button>
          </div>
        </div>
      )}

      <AnnouncementsTable
        rows={rows}
        rowNumberOffset={rowNumberOffset}
        selectedIds={selectedIds}
        allSelected={selectedIds.size > 0 && selectedIds.size === rows.length}
        busyId={busyId}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        {...rowActions}
      />
      <AnnouncementMobileCard rows={rows} selectedIds={selectedIds} busyId={busyId} onToggleSelect={toggleSelect} {...rowActions} />

      {deleteTarget && (
        <ConfirmDialog
          open
          tone="danger"
          title={deleteTarget.kind === "single" ? t("deleteTitleSingle") : t("deleteTitleBulk", { count: deleteTarget.ids.length })}
          description={deleteTarget.kind === "single" ? t("deleteDescriptionSingle", { name: deleteTarget.name }) : t("deleteDescriptionBulk")}
          hint={t("deleteHint")}
          confirmLabel={t("deleteConfirm")}
          busyLabel={t("deleting")}
          busy={bulkBusy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
