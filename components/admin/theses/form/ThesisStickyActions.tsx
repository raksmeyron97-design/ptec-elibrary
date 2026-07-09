"use client";

import { Eye } from "lucide-react";
import ThesisAutosaveStatus, { type AutosaveStatus } from "./ThesisAutosaveStatus";
import type { ThesisStatus } from "@/lib/admin/theses-shared";

/**
 * Sticky publish bar (spec §14). Buttons are real submit buttons
 * distinguished by `name="intent"` so ThesisForm's onSubmit can read
 * `event.nativeEvent.submitter` and override the selected status before
 * building the payload — "Save Draft" always saves as a draft regardless of
 * what's selected in the Review step's publish panel.
 */
export default function ThesisStickyActions({
  isEdit,
  status,
  scheduledAtSet,
  wasPublished,
  submitting,
  onPreview,
  autosaveStatus,
}: {
  isEdit: boolean;
  status: ThesisStatus;
  scheduledAtSet: boolean;
  wasPublished: boolean;
  submitting: boolean;
  onPreview: () => void;
  autosaveStatus?: AutosaveStatus;
}) {
  const primaryLabel =
    status === "published"
      ? "Publish"
      : status === "scheduled"
        ? "Schedule Publish"
        : isEdit
          ? "Update"
          : "Save Draft";

  const primaryDisabled = submitting || (status === "scheduled" && !scheduledAtSet);
  const showDraftShortcut = status !== "draft";

  return (
    <div className="sticky top-[64px] z-20 flex flex-wrap items-center gap-2.5 rounded-xl border border-divider bg-bg-surface/95 p-3 shadow-md backdrop-blur">
      <ThesisAutosaveStatus status={autosaveStatus ?? "idle"} />

      {showDraftShortcut && (
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEdit && wasPublished ? "Unpublish" : "Save Draft"}
        </button>
      )}

      <button
        type="button"
        onClick={onPreview}
        disabled={submitting}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Eye className="h-4 w-4" /> Preview
      </button>

      <button
        type="submit"
        name="intent"
        value="submit"
        disabled={primaryDisabled}
        className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Saving…" : primaryLabel}
      </button>
    </div>
  );
}
