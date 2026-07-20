"use client";

import { useTranslations } from "next-intl";
import { Loader2, Check, AlertTriangle, TriangleAlert, ListChecks, X } from "lucide-react";

export type SaveState = "idle" | "saving" | "success" | "error" | "conflict";

export default function EditActionBar({
  changeCount,
  saveState,
  message,
  onSave,
  onCancel,
  onReview,
}: {
  changeCount: number;
  saveState: SaveState;
  message: string | null;
  onSave: () => void;
  onCancel: () => void;
  onReview: () => void;
}) {
  const t = useTranslations("adminRoles.actionBar");
  const saving = saveState === "saving";

  const status = (() => {
    switch (saveState) {
      case "saving":
        return { icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />, text: t("saving"), cls: "text-text-muted" };
      case "success":
        return { icon: <Check className="h-4 w-4" aria-hidden="true" />, text: message ?? t("allSaved"), cls: "text-emerald-600" };
      case "error":
        return { icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />, text: message ?? t("couldNotSave"), cls: "text-red-600" };
      case "conflict":
        return { icon: <TriangleAlert className="h-4 w-4" aria-hidden="true" />, text: message ?? t("conflictShort"), cls: "text-amber-600" };
      default:
        return null;
    }
  })();

  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-2 border-t border-divider bg-bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.3)] backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3" aria-live="polite">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
              changeCount > 0 ? "bg-gold-100 text-gold-800 ring-1 ring-inset ring-gold-300" : "bg-paper text-text-muted"
            }`}
          >
            {changeCount > 0 ? t("unsaved", { count: changeCount }) : t("noChanges")}
          </span>
          {status && (
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${status.cls}`}>
              {status.icon}
              {status.text}
            </span>
          )}
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onReview}
            disabled={changeCount === 0 || saving}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex-none"
          >
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            {t("review")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={changeCount === 0 || saving}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex-none"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />}
            {saving ? t("savingShort") : <><span className="sm:hidden">{t("save")}</span><span className="hidden sm:inline">{t("saveChanges")}</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
