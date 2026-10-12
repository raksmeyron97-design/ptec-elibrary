"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDialog, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { addUrlRedirect, deleteUrlRedirect } from "@/app/actions/retired-urls";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/admin/kit/form";

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
  const canAdd = useCan("books.retiredUrls.addRedirect");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fromId = useId();
  const toId = useId();

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addUrlRedirect({ from, to });
      if (result.success) {
        toast.success(t("toast.redirectAdded"));
        setFrom("");
        setTo("");
        router.refresh();
      } else {
        toast.error(t(`errors.${result.code}`));
      }
    });
  }

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
    <div className="space-y-4">
      {canAdd && (
        <form onSubmit={add} className="space-y-3 rounded-xl border border-divider bg-bg-surface p-4" aria-labelledby={`${fromId}-title`}>
          <div>
            <h3 id={`${fromId}-title`} className="text-sm font-semibold text-text-heading">{t("addRedirect.title")}</h3>
            <p className="text-xs text-text-muted">{t("addRedirect.hint")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor={fromId} className={`${LABEL_CLASS} mb-1.5 block`}>{t("addRedirect.from")}</label>
              <input id={fromId} value={from} onChange={(e) => setFrom(e.target.value)} required className={INPUT_CLASS} placeholder="/subjects/…" />
            </div>
            <div>
              <label htmlFor={toId} className={`${LABEL_CLASS} mb-1.5 block`}>{t("addRedirect.to")}</label>
              <input id={toId} value={to} onChange={(e) => setTo(e.target.value)} required className={INPUT_CLASS} placeholder="/subjects/…" />
            </div>
            <button
              type="submit"
              disabled={pending || !from.trim() || !to.trim()}
              className="focus-field inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover disabled:opacity-50"
            >
              {t("addRedirect.submit")}
            </button>
          </div>
        </form>
      )}
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
    </div>
  );
}
