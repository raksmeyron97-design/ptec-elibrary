"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDialog, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { deleteUrlRedirect } from "@/app/actions/retired-urls";

export type UIRedirect = {
  oldPath: string;
  targetPath: string | null;
  status: number;
  reason: string;
  createdLabel: string | null;
  /** Created by a person (a queue decision) rather than by a trigger. */
  byPerson: boolean;
};

/**
 * Every url_redirects row, for admins only — the reason column is private
 * (it can say rights_removal). Deleting a row makes its path answer 404 again.
 */
export default function RedirectsTable({ rows, canDelete }: { rows: UIRedirect[]; canDelete: boolean }) {
  const t = useTranslations("adminRetiredUrls");
  const toast = useToast();
  const router = useRouter();
  const allowed = useCan("books.retiredUrls.deleteRedirect") && canDelete;
  const [target, setTarget] = useState<UIRedirect | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!target) return;
    const path = target.oldPath;
    startTransition(async () => {
      const result = await deleteUrlRedirect({ path });
      setTarget(null);
      if (result.success) {
        toast.success(t("toast.redirectDeleted"));
        router.refresh();
      } else {
        toast.error(t(`errors.${result.code}`));
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-divider bg-paper text-xs font-semibold text-text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5">{t("columns.from")}</th>
            <th scope="col" className="px-4 py-2.5">{t("columns.answer")}</th>
            <th scope="col" className="px-4 py-2.5">{t("columns.reason")}</th>
            <th scope="col" className="px-4 py-2.5">{t("columns.created")}</th>
            {allowed && (
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">{t("columns.actions")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {rows.map((r) => (
            <tr key={r.oldPath}>
              <td className="max-w-[22rem] break-all px-4 py-2.5 font-mono text-xs text-text-body">{r.oldPath}</td>
              <td className="max-w-[22rem] break-all px-4 py-2.5 font-mono text-xs text-text-body">
                {r.status === 410 ? t("answer.gone") : `301 → ${r.targetPath}`}
              </td>
              <td className="px-4 py-2.5 text-text-body">{t(`reason.${r.reason}`)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">
                {r.createdLabel ?? "—"} · {r.byPerson ? t("createdBy.person") : t("createdBy.system")}
              </td>
              {allowed && (
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setTarget(r)}
                    className="focus-field rounded-lg px-2 py-1 text-sm font-semibold text-danger-text hover:bg-danger-soft"
                  >
                    {t("actions.delete")}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmDialog
        open={target !== null}
        title={t("deleteDialog.title")}
        description={target ? t("deleteDialog.body", { path: target.oldPath }) : undefined}
        confirmLabel={t("deleteDialog.confirm")}
        busy={pending}
        onCancel={() => setTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
