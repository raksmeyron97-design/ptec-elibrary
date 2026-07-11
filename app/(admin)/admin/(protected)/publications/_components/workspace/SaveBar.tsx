"use client";

// Sticky action bar: truthful save state, autosave status, validation
// shortcuts, and the primary actions. Never reports "Saved" optimistically —
// the state only changes after the server confirms.

import { AlertCircle, AlertTriangle, CheckCircle2, CloudOff, Eye, Loader2, Save, UploadCloud } from "lucide-react";

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
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-divider bg-bg-surface/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
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

          {errorCount > 0 ? (
            <button
              type="button"
              onClick={onReview}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full bg-danger/10 px-2.5 text-[11.5px] font-bold text-danger transition-colors hover:bg-danger/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {errorCount} blocking
            </button>
          ) : null}
          {warningCount > 0 ? (
            <button
              type="button"
              onClick={onReview}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full bg-warning/10 px-2.5 text-[11.5px] font-bold text-warning transition-colors hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[11px] text-text-muted md:inline-flex">
            <kbd className="rounded border border-divider bg-paper px-1.5 py-0.5 font-medium">⌘S</kbd>
            saves
          </span>
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 text-[13px] font-semibold text-text-body transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            type="submit"
            disabled={disabled || saving}
            className="btn-brand-gradient inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={onReview}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-brand/50 px-3 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <span className="hidden sm:inline">Review & publish</span>
            <span className="sm:hidden">Review</span>
          </button>
        </div>
      </div>
    </div>
  );
}
