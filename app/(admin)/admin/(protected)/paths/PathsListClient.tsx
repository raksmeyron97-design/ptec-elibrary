"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { GraduationCap, Layers, Pencil, Trash2, ExternalLink } from "lucide-react";
import { deletePath } from "@/app/actions/learning-paths";
import type { LearningPathSummary } from "@/app/actions/learning-paths";
import { ConfirmDialog, EmptyState, StatusBadge, useToast } from "@/components/admin/kit";

export default function PathsListClient({ paths: initial }: { paths: LearningPathSummary[] }) {
  const t = useTranslations("adminPaths");
  const toast = useToast();
  const [paths, setPaths] = useState(initial);
  const [confirmTarget, setConfirmTarget] = useState<LearningPathSummary | null>(null);
  const [deleteBusy, startDelete] = useTransition();

  function handleDelete(path: LearningPathSummary) {
    startDelete(async () => {
      const res = await deletePath(path.id);
      if ("error" in res) {
        toast.error(res.error || t("toasts.deleteFailed"));
        return;
      }
      setPaths((prev) => prev.filter((p) => p.id !== path.id));
      setConfirmTarget(null);
      toast.success(t("toasts.deleted"));
    });
  }

  return (
    <>
      {paths.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title={t("empty.title")}
          description={t("empty.description")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {paths.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={p.is_published ? "success" : "warning"}>
                    {t(p.is_published ? "status.published" : "status.draft")}
                  </StatusBadge>
                  {p.audience && <span className="text-[11px] font-semibold text-text-muted">{p.audience}</span>}
                </div>
                <h3 className="mt-1.5 truncate text-[15px] font-bold text-text-heading">{p.title}</h3>
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-text-muted">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" /> {t("steps", { count: p.stepCount })}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {p.is_published && (
                  <Link
                    href={`/paths/${p.slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-[12px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.view")}
                  </Link>
                )}
                <Link
                  href={`/admin/paths/edit/${p.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-[12px] font-semibold text-text-muted transition hover:border-brand/40 hover:text-brand"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.edit")}
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmTarget(p)}
                  disabled={deleteBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/5 px-3 py-1.5 text-[12px] font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        title={t("deleteDialog.title")}
        description={confirmTarget ? t("deleteDialog.description", { title: confirmTarget.title }) : undefined}
        confirmLabel={t("deleteDialog.confirm")}
        busyLabel={t("deleteDialog.busy")}
        busy={deleteBusy}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => confirmTarget && handleDelete(confirmTarget)}
      />
    </>
  );
}
