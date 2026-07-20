"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, X } from "lucide-react";
import { ALL_ROLES, type AppRole } from "@/lib/types/roles";
import { userLabel, type UserRow } from "@/lib/admin/users-shared";

/** Shared modal shell: backdrop, escape-to-close, focus trap-ish, body lock. */
function Modal({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-bg-surface p-6 shadow-2xl sm:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const t = useTranslations("adminUsers.dialogs");
  return (
    <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading">
      <X className="h-5 w-5" />
    </button>
  );
}

// ── Confirm ──────────────────────────────────────────────────────────────────
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("adminUsers.dialogs");
  const headingId = "confirm-dialog-heading";
  return (
    <Modal labelledBy={headingId} onClose={onCancel}>
      <div className="flex items-start gap-3">
        {danger && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600" aria-hidden="true">
            <AlertTriangle className="h-5 w-5" />
          </span>
        )}
        <div className="flex-1">
          <h2 id={headingId} className="text-lg font-bold text-text-heading">{title}</h2>
          <div className="mt-1.5 text-sm text-text-muted">{body}</div>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-text-body hover:bg-paper disabled:opacity-50">
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition disabled:opacity-60 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-brand hover:bg-brand-hover"}`}
        >
          {busy ? t("working") : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ── Assign role ──────────────────────────────────────────────────────────────
export function RoleDialog({
  user,
  canAssignAdmin,
  busy,
  onConfirm,
  onCancel,
}: {
  user: UserRow;
  canAssignAdmin: boolean;
  busy: boolean;
  onConfirm: (role: AppRole) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("adminUsers.dialogs");
  const tRoles = useTranslations("adminUsers.roles");
  const tRoleDesc = useTranslations("adminUsers.roleDescriptions");
  const [role, setRole] = useState<AppRole>(user.role);
  const headingId = "role-dialog-heading";
  return (
    <Modal labelledBy={headingId} onClose={onCancel}>
      <div className="mb-4 flex items-center justify-between">
        <h2 id={headingId} className="text-lg font-bold text-text-heading">{t("assignRole")}</h2>
        <CloseButton onClose={onCancel} />
      </div>
      <p className="mb-4 text-sm text-text-muted">
        {t("chooseFor")} <span className="font-semibold text-text-body">{userLabel(user)}</span>.
      </p>
      <div className="space-y-1.5">
        {ALL_ROLES.map((r) => {
          const disabled = (r === "admin" || r === "super_admin") && !canAssignAdmin;
          const active = role === r;
          return (
            <button
              key={r}
              type="button"
              disabled={disabled}
              onClick={() => setRole(r)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-brand bg-brand/5 ring-1 ring-brand/30" : "border-divider hover:bg-paper"}`}
            >
              <span className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${active ? "border-brand bg-brand" : "border-slate-300"}`} aria-hidden="true" />
              <span>
                <span className="flex items-center gap-2 text-sm font-bold text-text-heading">
                  {tRoles(r)}
                  {disabled && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">{t("superAdminOnly")}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">{tRoleDesc(r)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-text-body hover:bg-paper disabled:opacity-50">{t("cancel")}</button>
        <button
          type="button"
          disabled={busy || role === user.role}
          onClick={() => onConfirm(role)}
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
        >
          {busy ? t("saving") : t("saveRole")}
        </button>
      </div>
    </Modal>
  );
}
