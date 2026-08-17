"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X, ArrowRight, Loader2, Check } from "lucide-react";
import { ROLE_META } from "@/lib/types/roles";
import type { PermChange } from "@/lib/admin/roles-shared";
import { PermPill } from "./PermControl";
import { useResourceText } from "./useResourceText";

export default function ChangeReviewDialog({
  open,
  changes,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  changes: PermChange[];
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminRoles.review");
  const tRoles = useTranslations("adminUsers.roles");
  const res = useResourceText();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="modal-backdrop-in absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        className="modal-pop-in relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-divider bg-bg-surface shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
          <div>
            <h2 id="review-title" className="text-base font-bold text-text-heading">{t("title")}</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {t("summary", { count: changes.length })}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={saving} aria-label={t("close")} className="rounded-lg p-1.5 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="flex-1 divide-y divide-divider overflow-y-auto px-5">
          {changes.map((c) => (
            <li key={`${c.role}:${c.resource}`} className="flex items-center gap-3 py-3 text-sm">
              <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${ROLE_META[c.role].bgColor} ${ROLE_META[c.role].color} ${ROLE_META[c.role].borderColor}`}>
                {tRoles(c.role)}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-text-heading">{res.label(c.resource)}</span>
              <PermPill level={c.from} />
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
              <PermPill level={c.to} />
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2 border-t border-divider px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-10 items-center rounded-xl border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            {t("keepEditing")}
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white transition hover:bg-brand-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />}
            {saving ? t("saving") : t("confirmSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
