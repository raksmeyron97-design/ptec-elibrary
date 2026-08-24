"use client";

// Sticky action bar: truthful save state, autosave status, validation
// shortcuts, and the primary actions. Never reports "Saved" optimistically —
// the state only changes after the server confirms.

import { AlertCircle, AlertTriangle, CloudOff, Eye, Loader2, UploadCloud } from "lucide-react";
import {
  StickyActionBar,
  SaveStatus,
  BTN_PRIMARY,
  BTN_SECONDARY,
  type SaveLifecycle,
} from "@/components/admin/kit/form";

export type AutosaveState =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error"
  | "stale"
  | "unavailable";

export interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  lastSavedAt: Date | null;
  autosave: AutosaveState;
  errorCount: number;
  warningCount: number;
  isEdit: boolean;
  disabled?: boolean;
  onPreview: () => void;
  onReview: () => void;
}

export default function SaveBar({
  dirty,
  saving,
  lastSavedAt,
  autosave,
  errorCount,
  warningCount,
  isEdit,
  disabled = false,
  onPreview,
  onReview,
}: SaveBarProps) {
  /*
    One lifecycle, ordered by precedence rather than by what is cheapest to
    check: in-flight beats dirty beats saved beats idle. The autosave sub-states
    fold into it — "autosaving a recovery draft" and "saving" are the same fact
    to the author, and the difference was only ever visible as slightly
    different wording in a status line nobody reads twice.

    `autosave === "error" | "stale"` stays distinguishable, because that one
    changes what the author should do: save manually.
  */
  const lifecycle: SaveLifecycle =
    saving || autosave === "saving" || autosave === "pending"
      ? "saving"
      : autosave === "error" || autosave === "stale"
        ? "error"
        : dirty
          ? "dirty"
          : lastSavedAt
            ? "saved"
            : "idle";

  return (
    <StickyActionBar
      status={
        <>
          {autosave === "unavailable" && !saving && !dirty ? (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text-muted">
              <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
              Autosave unavailable
            </span>
          ) : (
            <SaveStatus
              state={lifecycle}
              savedAt={lastSavedAt ? lastSavedAt.getTime() : null}
              labels={{
                idle: isEdit ? "No changes yet" : "Not saved yet",
                dirty: autosave === "saved" ? "Unsaved changes — recovery draft kept" : "Unsaved changes",
                saving: "Saving…",
                error: "Autosave failed — save manually",
                savedAgo: (seconds) =>
                  seconds < 60
                    ? "Saved just now"
                    : seconds < 3600
                      ? `Saved ${Math.floor(seconds / 60)} min ago`
                      : `Saved ${Math.floor(seconds / 3600)}h ago`,
              }}
            />
          )}

          {/*
            These stay buttons, not decorative pills: their whole value is that
            they jump to the Review step where the individual problems are
            listed. A count you cannot act on is just anxiety.
          */}
          {errorCount > 0 ? (
            <button
              type="button"
              onClick={onReview}
              className="focus-field inline-flex min-h-8 items-center gap-1 rounded-full border border-danger-line bg-danger-soft px-2.5 text-[11.5px] font-bold text-danger-text transition-colors hover:bg-danger/15"
            >
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {errorCount} blocking
            </button>
          ) : null}
          {warningCount > 0 ? (
            <button
              type="button"
              onClick={onReview}
              className="focus-field inline-flex min-h-8 items-center gap-1 rounded-full border border-warning-line bg-warning-soft px-2.5 text-[11.5px] font-bold text-warning-text transition-colors hover:bg-warning/15"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </button>
          ) : null}
        </>
      }
    >
      <span className="mr-1 hidden items-center gap-1 text-[11px] text-text-muted md:inline-flex">
        <kbd className="rounded border border-divider bg-paper px-1.5 py-0.5 font-medium">⌘S</kbd>
        saves
      </span>

      <button type="button" onClick={onPreview} className={BTN_SECONDARY}>
        <Eye className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Preview</span>
      </button>

      <button type="submit" disabled={disabled || saving} className={BTN_SECONDARY}>
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <UploadCloud className="h-4 w-4" aria-hidden="true" />
        )}
        {saving ? "Saving…" : "Save draft"}
      </button>

      {/*
        "Review & publish" is the primary here, not Save draft. Publishing is
        what the form is for, and this is the button that leads to it — Save
        draft was carrying the gradient while the action that finishes the job
        sat next to it as an outline.
      */}
      <button type="button" onClick={onReview} className={BTN_PRIMARY}>
        <span className="hidden sm:inline">Review &amp; publish</span>
        <span className="sm:hidden">Review</span>
      </button>
    </StickyActionBar>
  );
}
