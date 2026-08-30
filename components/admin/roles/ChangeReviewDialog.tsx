"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import type { AppRole } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";
import { groupedChanges, type PermChange } from "@/lib/admin/roles-shared";
import DialogShell from "./DialogShell";
import { PermPill } from "./PermControl";
import { useResourceText } from "./useResourceText";

/**
 * The confirmation step — now the only route to a write.
 *
 * Changes are bucketed by role rather than listed flat: an editor who worked
 * across three roles is being asked "is this what you meant for each of them?",
 * and a flat list of nineteen rows cannot be checked against that question.
 */
export default function ChangeReviewDialog({
  open,
  changes,
  allRoles,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  changes: PermChange[];
  allRoles: AppRole[];
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminRoles.review");
  const tGroups = useTranslations("adminRoles.groups");
  const tRoles = useTranslations("adminUsers.roles");
  const res = useResourceText();
  const buckets = groupedChanges(changes, allRoles);

  return (
    <DialogShell
      open={open}
      title={t("title")}
      subtitle={t("summary", { count: changes.length })}
      busy={saving}
      onClose={onClose}
      closeLabel={t("close")}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="focus-field inline-flex h-10 items-center rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-40"
          >
            {t("keepEditing")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || changes.length === 0}
            className="focus-field inline-flex h-10 items-center gap-2 rounded-lg bg-admin-accent px-5 text-sm font-semibold text-white transition hover:bg-admin-accent-hover disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            )}
            {saving ? t("saving") : t("confirmSave")}
          </button>
        </>
      }
    >
      {buckets.map(({ role, groups }) => {
        const roleTotal = groups.reduce((n, g) => n + g.changes.length, 0);
        return (
          <section key={role}>
            <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b border-divider bg-paper px-5 py-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${ROLE_META[role].bgColor} ${ROLE_META[role].color} ${ROLE_META[role].borderColor}`}
              >
                {tRoles(role)}
              </span>
              <span className="text-xs text-text-muted">
                {t("roleCount", { count: roleTotal })}
              </span>
            </h3>

            {groups.map((group) => (
              <div key={group.id}>
                <h4 className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {tGroups(group.id)}
                </h4>
                <ul className="divide-y divide-divider/60 px-5">
                  {group.changes.map((c) => (
                    <li
                      key={`${c.role}:${c.resource}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 font-medium text-text-heading">
                        {res.label(c.resource)}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <PermPill level={c.from} />
                        <ArrowRight
                          className="h-3.5 w-3.5 shrink-0 text-text-muted"
                          aria-hidden="true"
                        />
                        <PermPill level={c.to} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </DialogShell>
  );
}
