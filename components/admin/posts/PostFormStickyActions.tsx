"use client";

import { useTranslations } from "next-intl";
import { Eye, Check, Loader2, AlertCircle } from "lucide-react";
import type { PostStatus } from "@/lib/admin/posts-shared";

type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

const AUTOSAVE_DISPLAY: Record<Exclude<AutosaveStatus, "idle">, { key: string; className: string; icon: React.ReactNode }> = {
  unsaved: { key: "unsaved", className: "text-text-muted", icon: null },
  saving: { key: "saving", className: "text-text-muted", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  saved: { key: "saved", className: "text-emerald-600", icon: <Check className="h-3 w-3" /> },
  error: { key: "error", className: "text-red-600", icon: <AlertCircle className="h-3 w-3" /> },
};

/**
 * Sticky publish bar. Buttons are real submit buttons distinguished by
 * `name="intent"` so PostForm's onSubmit can read `event.nativeEvent.submitter`
 * and override the selected status before building the payload — e.g.
 * "Save as Draft" always saves as a draft regardless of what's selected in
 * the publish panel, while the primary button follows whatever status is
 * currently selected there (Publish / Schedule Post / Save Changes).
 */
export default function PostFormStickyActions({
  isEdit,
  status,
  scheduledAtSet,
  wasPublished,
  submitting,
  onPreview,
  autosaveStatus,
}: {
  isEdit: boolean;
  status: PostStatus;
  scheduledAtSet: boolean;
  wasPublished: boolean;
  submitting: boolean;
  onPreview: () => void;
  autosaveStatus?: AutosaveStatus;
}) {
  const t = useTranslations("adminPostForm.actions");
  const primaryLabel =
    status === "published"
      ? t("publish")
      : status === "scheduled"
        ? t("schedule")
        : isEdit
          ? t("saveChanges")
          : t("saveDraft");

  const primaryDisabled = submitting || (status === "scheduled" && !scheduledAtSet);
  const showDraftShortcut = status !== "draft";
  const autosaveDisplay = autosaveStatus && autosaveStatus !== "idle" ? AUTOSAVE_DISPLAY[autosaveStatus] : null;

  return (
    <div className="sticky top-[64px] z-20 flex flex-wrap items-center gap-2.5 rounded-xl border border-divider bg-bg-surface/95 p-3 shadow-md backdrop-blur">
      {autosaveDisplay && (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${autosaveDisplay.className}`} aria-live="polite">
          {autosaveDisplay.icon}
          {t(`autosave.${autosaveDisplay.key}`)}
        </span>
      )}

      {showDraftShortcut && (
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEdit && wasPublished ? t("unpublish") : t("saveAsDraft")}
        </button>
      )}

      <button
        type="button"
        onClick={onPreview}
        disabled={submitting}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Eye className="h-4 w-4" /> {t("preview")}
      </button>

      <button
        type="submit"
        name="intent"
        value="submit"
        disabled={primaryDisabled}
        className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? t("saving") : primaryLabel}
      </button>
    </div>
  );
}
