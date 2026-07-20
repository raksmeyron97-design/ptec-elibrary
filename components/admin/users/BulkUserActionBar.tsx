"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { UserCog, Ban, Trash2, X } from "lucide-react";
import { ALL_ROLES, type AppRole } from "@/lib/types/roles";

export default function BulkUserActionBar({
  count,
  busy,
  canAssignAdmin,
  onAssignRole,
  onSuspend,
  onDelete,
  exportMenu,
  onClear,
}: {
  count: number;
  busy: boolean;
  canAssignAdmin: boolean;
  onAssignRole: (role: AppRole) => void;
  onSuspend: () => void;
  onDelete: () => void;
  /** Export menu for the selected rows (see components/admin/ExportMenu). */
  exportMenu: ReactNode;
  onClear: () => void;
}) {
  const t = useTranslations("adminUsers.bulk");
  const tRoles = useTranslations("adminUsers.roles");
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  if (count === 0) return null;

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      role="toolbar"
      aria-label={t("toolbarLabel")}
      className="sticky top-[64px] z-30 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 shadow-sm"
    >
      <button type="button" onClick={onClear} aria-label={t("clearSelection")} className="flex h-7 w-7 items-center justify-center rounded-full text-brand hover:bg-brand/10">
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="text-[13.5px] font-bold text-brand" aria-live="polite">
        {t("selected", { count })}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <button type="button" disabled={busy} onClick={() => setRolePickerOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={rolePickerOpen} className={btn}>
            <UserCog className="h-3.5 w-3.5" /> {t("assignRole")}
          </button>
          {rolePickerOpen && (
            <div role="dialog" aria-label={t("assignRole")} className="absolute right-0 z-40 mt-1 w-52 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl">
              {ALL_ROLES.map((r) => {
                const disabled = (r === "admin" || r === "super_admin") && !canAssignAdmin;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={disabled}
                    onClick={() => { onAssignRole(r); setRolePickerOpen(false); }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-medium text-text-body hover:bg-paper disabled:opacity-40"
                  >
                    {tRoles(r)}
                    {disabled && <span className="text-[10px] text-text-muted">{t("superAdminOnly")}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {exportMenu}
        <button type="button" disabled={busy} onClick={onSuspend} className={btn}>
          <Ban className="h-3.5 w-3.5" /> {t("suspend")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t("delete")}
        </button>
      </div>
    </div>
  );
}
