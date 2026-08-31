"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Check, ListChecks, Loader2, TriangleAlert, Undo2 } from "lucide-react";
import type { AppRole } from "@/lib/types/roles";

export type SaveState = "idle" | "saving" | "success" | "error" | "conflict";

/**
 * The save cluster, pinned to the bottom of the workspace while editing.
 *
 * One deliberate change from the previous bar: there is no button that writes
 * permissions without showing them first. "Save changes" used to sit beside
 * "Review", which made the checked path the optional one on the single screen
 * in the panel where a wrong click silently grants or removes access. Now the
 * primary opens the review sheet and the write happens from there.
 */
export default function EditActionBar({
  changeCount,
  perRole,
  roleLabel,
  saveState,
  message,
  onReview,
  onDiscard,
}: {
  changeCount: number;
  /** Per-role breakdown, so "12 changes" never hides which roles moved. */
  perRole: { role: AppRole; count: number }[];
  roleLabel: (role: AppRole) => string;
  saveState: SaveState;
  message: string | null;
  onReview: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("adminRoles.actionBar");
  const saving = saveState === "saving";

  const status = (() => {
    switch (saveState) {
      case "saving":
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />,
          text: t("saving"),
          cls: "text-text-body",
        };
      case "success":
        return { icon: <Check className="h-4 w-4" aria-hidden="true" />, text: message ?? t("allSaved"), cls: "text-success-text" };
      case "error":
        return { icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />, text: message ?? t("couldNotSave"), cls: "text-danger-text" };
      case "conflict":
        return { icon: <TriangleAlert className="h-4 w-4" aria-hidden="true" />, text: message ?? t("conflictShort"), cls: "text-warning-text" };
      default:
        return null;
    }
  })();

  return (
    <div className="sticky bottom-0 z-30 -mx-7 mt-4 border-t border-divider bg-bg-surface/95 px-7 py-3 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.3)] backdrop-blur">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5" aria-live="polite">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
              changeCount > 0
                ? "bg-gold-100 text-gold-800 ring-1 ring-inset ring-gold-300"
                : "bg-paper text-text-muted"
            }`}
          >
            {changeCount > 0 ? t("unsaved", { count: changeCount }) : t("noChanges")}
          </span>

          {changeCount > 0 && (
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
              {perRole.map(({ role, count }) => (
                <span
                  key={role}
                  className="rounded-md border border-divider bg-paper px-1.5 py-0.5 font-medium tabular-nums"
                >
                  {roleLabel(role)} {count}
                </span>
              ))}
            </span>
          )}

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
            onClick={onDiscard}
            disabled={saving}
            className="focus-field inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            {changeCount > 0 ? t("discard") : t("exitEditing")}
          </button>
          <button
            type="button"
            onClick={onReview}
            disabled={changeCount === 0 || saving}
            className="focus-field inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-admin-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-admin-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? t("savingShort") : t("reviewAndSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
