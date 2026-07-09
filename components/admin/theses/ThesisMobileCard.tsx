"use client";

import { Eye, Download } from "lucide-react";
import ThesisActionsMenu from "@/components/admin/theses/ThesisActionsMenu";
import ThesisMetadataBadge from "@/components/admin/theses/ThesisMetadataBadge";
import ThesisFileStatusBadge from "@/components/admin/theses/ThesisFileStatusBadge";
import { STATUS_BADGE_STYLES, STATUS_LABELS, type ThesisListRow, type ThesisProgramOption } from "@/lib/admin/theses-shared";

function programLabel(programs: ThesisProgramOption[], code: string | null): string {
  if (!code) return "No program";
  return programs.find((p) => p.code === code)?.label ?? code;
}

export default function ThesisMobileCard({
  rows,
  programs,
  selectedIds,
  busyId,
  onToggleSelect,
  onPublish,
  onUnpublish,
  onArchive,
  onUnarchive,
  onDuplicate,
  onDeleteRequest,
}: {
  rows: ThesisListRow[];
  programs: ThesisProgramOption[];
  selectedIds: Set<string>;
  busyId: string | null;
  onToggleSelect: (id: string) => void;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDeleteRequest: (id: string, title: string) => void;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.map((thesis) => {
        const isSelected = selectedIds.has(thesis.id);
        const isBusy = busyId === thesis.id;
        return (
          <div
            key={thesis.id}
            className={`rounded-xl border p-4 shadow-sm transition ${isSelected ? "border-brand/40 bg-brand/5" : "border-divider bg-bg-surface"} ${isBusy ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(thesis.id)}
                aria-label={`Select ${thesis.title}`}
                className="mt-1 h-4 w-4 shrink-0 rounded border-divider text-brand focus:ring-focus-ring/30"
              />
              {thesis.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thesis.coverUrl} alt="" loading="lazy" className="h-16 w-12 shrink-0 rounded object-cover shadow-sm" />
              ) : (
                <div className="h-16 w-12 shrink-0 rounded border border-divider bg-paper" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-[1.6] text-text-heading line-clamp-2">{thesis.title}</p>
                <p className="mt-0.5 truncate text-xs text-text-muted">{thesis.authorNames || "No author listed"}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {programLabel(programs, thesis.program)} · {thesis.cohort ? `Cohort ${thesis.cohort}` : "No cohort"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE_STYLES[thesis.status]}`}>
                    {STATUS_LABELS[thesis.status]}
                  </span>
                  <ThesisMetadataBadge thesis={thesis} />
                </div>
                <div className="mt-2">
                  <ThesisFileStatusBadge hasPdf={Boolean(thesis.fileUrl)} hasCover={Boolean(thesis.coverUrl)} />
                </div>
                <dl className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                  <div className="flex items-center gap-1"><Eye className="h-3 w-3" /> {thesis.viewCount.toLocaleString()}</div>
                  <div className="flex items-center gap-1"><Download className="h-3 w-3" /> {thesis.downloadCount.toLocaleString()}</div>
                </dl>
              </div>
              <ThesisActionsMenu
                thesis={thesis}
                busy={isBusy}
                onPublish={() => onPublish(thesis.id)}
                onUnpublish={() => onUnpublish(thesis.id)}
                onArchive={() => onArchive(thesis.id)}
                onUnarchive={() => onUnarchive(thesis.id)}
                onDuplicate={() => onDuplicate(thesis.id)}
                onDelete={() => onDeleteRequest(thesis.id, thesis.title)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
