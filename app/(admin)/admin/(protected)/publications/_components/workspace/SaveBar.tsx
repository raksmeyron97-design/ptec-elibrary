"use client";

// Sticky action bar: truthful save state, autosave status, validation
// shortcuts, and the primary actions. Never reports "Saved" optimistically —
// the state only changes after the server confirms.

import { AlertCircle, AlertTriangle, CheckCircle2, CloudOff, Eye, Loader2, Save, UploadCloud } from "lucide-react";
import { StickyActionBar, BTN_PRIMARY, BTN_SECONDARY } from "@/components/admin/kit/form";

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

function timeLabel(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  let status: { icon: typeof Save; text: string; tone: string };
  if (saving) {
    status = { icon: Loader2, text: "Saving…", tone: "text-brand" };
  } else if (autosave === "saving" || autosave === "pending") {
    status = { icon: Loader2, text: "Autosaving draft…", tone: "text-text-muted" };
  } else if (dirty) {
    status = {
      icon: AlertCircle,
      text:
        autosave === "saved"
          ? "Unsaved changes — recovery draft kept"
          : autosave === "unavailable"
            ? "Unsaved changes — autosave unavailable"
            : autosave === "error" || autosave === "stale"
              ? "Unsaved changes — autosave failed, save manually"
              : "Unsaved changes",
      tone: autosave === "error" || autosave === "stale" ? "text-warning" : "text-text-muted",
    };
  } else if (lastSavedAt) {
    status = { icon: CheckCircle2, text: `Saved at ${timeLabel(lastSavedAt)}`, tone: "text-success" };
  } else {
    status = { icon: Save, text: isEdit ? "No changes yet" : "Not saved yet", tone: "text-text-muted" };
  }

  const StatusIcon = status.icon;

  return (
    <StickyActionBar
      status={
        <>
          <p role="status" aria-live="polite" className={`flex items-center gap-1.5 text-[12.5px] font-medium ${status.tone}`}>
            {autosave === "unavailable" && !saving && !dirty ? (
              <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <StatusIcon
                className={`h-3.5 w-3.5 ${saving || autosave === "saving" || autosave === "pending" ? "animate-spin motion-reduce:animate-none" : ""}`}
                aria-hidden="true"
              />
            )}
            {status.text}
          </p>

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
