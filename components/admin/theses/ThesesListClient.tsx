"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/admin/kit";
import BulkThesisActionBar from "@/components/admin/theses/BulkThesisActionBar";
import ThesesTable from "@/components/admin/theses/ThesesTable";
import ThesisMobileCard from "@/components/admin/theses/ThesisMobileCard";
import DeleteThesisDialog, { type DeleteTarget } from "@/components/admin/theses/DeleteThesisDialog";
import { ThesisEmptyState, ThesisNoResultsState } from "@/components/admin/theses/states/ThesisEmptyState";
import type { ThesisListRow, ThesisProgramOption } from "@/lib/admin/theses-shared";
import {
  toggleThesisPublishStatus,
  archiveThesis,
  unarchiveThesis,
  duplicateThesis,
  deleteThesis,
  bulkUpdateTheses,
  type BulkThesisAction,
} from "@/app/actions/theses";

function toCsvValue(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: ThesisListRow[], programs: ThesisProgramOption[]) {
  const header = ["Title", "Author(s)", "Advisor", "Program", "Cohort", "Academic Year", "Status", "DOI", "Views", "Downloads", "Published At", "Created At"];
  const lines = rows.map((r) => [
    r.title,
    r.authorNames,
    r.advisorName,
    programs.find((p) => p.code === r.program)?.label ?? r.program,
    r.cohort,
    r.academicYear,
    r.status,
    r.doi,
    r.viewCount,
    r.downloadCount,
    r.publishedAt,
    r.createdAt,
  ].map(toCsvValue).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `theses-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ThesesListClient({
  rows,
  programs,
  hasAnyThesesAtAll,
}: {
  rows: ThesisListRow[];
  programs: ThesisProgramOption[];
  /** Distinguishes "zero theses ever uploaded" from "zero theses match the current filters". */
  hasAnyThesesAtAll: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("adminTheses.toasts");
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
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

  async function runBulkAction(action: BulkThesisAction, payload?: { cohort?: string; academicYear?: string; program?: string }) {
    setBulkBusy(true);
    try {
      await bulkUpdateTheses(Array.from(selectedIds), action, payload);
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
        await deleteThesis(deleteTarget.id);
      } else {
        await bulkUpdateTheses(deleteTarget.ids, "delete");
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
    return hasAnyThesesAtAll ? <ThesisNoResultsState /> : <ThesisEmptyState />;
  }

  const rowActions = {
    onPublish: (id: string) => runRowAction(id, () => toggleThesisPublishStatus(id, true)),
    onUnpublish: (id: string) => runRowAction(id, () => toggleThesisPublishStatus(id, false)),
    onArchive: (id: string) => runRowAction(id, () => archiveThesis(id)),
    onUnarchive: (id: string) => runRowAction(id, () => unarchiveThesis(id)),
    onDuplicate: (id: string) => runRowAction(id, () => duplicateThesis(id)),
    onDeleteRequest: (id: string, title: string) => setDeleteTarget({ kind: "single", id, title }),
  };

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));

  return (
    <div className="space-y-4">
      <BulkThesisActionBar
        count={selectedIds.size}
        busy={bulkBusy}
        onPublish={() => runBulkAction("publish")}
        onUnpublish={() => runBulkAction("unpublish")}
        onChangeCohort={(cohort) => runBulkAction("cohort", { cohort })}
        onChangeAcademicYear={(academicYear) => runBulkAction("academicYear", { academicYear })}
        onArchive={() => runBulkAction("archive")}
        onDelete={() => setDeleteTarget({ kind: "bulk", ids: Array.from(selectedIds) })}
        onExportCsv={() => exportCsv(selectedRows.length ? selectedRows : rows, programs)}
        onClear={() => setSelectedIds(new Set())}
      />

      <ThesesTable
        rows={rows}
        programs={programs}
        selectedIds={selectedIds}
        allSelected={selectedIds.size > 0 && selectedIds.size === rows.length}
        busyId={busyId}
        expandedId={expandedId}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onToggleExpand={toggleExpand}
        {...rowActions}
      />
      <ThesisMobileCard
        rows={rows}
        programs={programs}
        selectedIds={selectedIds}
        busyId={busyId}
        onToggleSelect={toggleSelect}
        {...rowActions}
      />

      {deleteTarget && (
        <DeleteThesisDialog
          target={deleteTarget}
          busy={bulkBusy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
