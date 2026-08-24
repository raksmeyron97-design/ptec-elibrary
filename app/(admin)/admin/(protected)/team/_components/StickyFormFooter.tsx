"use client";

import { ChevronLeft, ChevronRight, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  StickyActionBar,
  ButtonBusy,
  UnsavedPill,
  SavedPill,
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_DANGER,
} from "@/components/admin/kit/form";

type StickyFormFooterProps = {
  activeTabIndex: number;
  totalTabs: number;
  onPrev: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onSavePublish: () => void;
  onCancel: () => void;
  isDirty: boolean;
  busy: boolean;
  phase: "idle" | "uploading" | "saving";
  isPublished: boolean;
  lastSaved: Date | null;
};

/**
 * The team form's action bar, on the shared StickyActionBar.
 *
 * Two things went with the rebase. The local `timeAgo` helper and the 60-second
 * `setTick` that drove it are gone — `SavedPill` reads the clock through
 * `useSyncExternalStore` over a 30-second bucket, which is both purer (the old
 * version called `new Date()` during render) and one clock instead of two. And
 * `tabLabel` is no longer a prop: the tab row above the form already names the
 * open section, so printing it again in the bar was the same string twice on
 * one screen.
 *
 * `contained={false}` because this form uses the split layout — its content
 * spans the form column plus the preview aside, so pinning the bar's content
 * to 900px would have left the buttons short of the form's own right edge.
 */
export default function StickyFormFooter({
  activeTabIndex,
  totalTabs,
  onPrev,
  onNext,
  onSaveDraft,
  onSavePublish,
  onCancel,
  isDirty,
  busy,
  phase,
  isPublished,
  lastSaved,
}: StickyFormFooterProps) {
  return (
    <StickyActionBar
      contained={false}
      status={
        <>
          {/*
            Step position and the prev/next pair, with the save state. The tab
            row says which section is open; this says how far through the form
            that is, and moves you without aiming at a tab.
          */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={activeTabIndex === 0}
              aria-label="Previous section"
              className="focus-field inline-flex h-8 w-8 items-center justify-center rounded-lg border border-divider text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="whitespace-nowrap text-xs font-medium tabular-nums text-text-muted">
              {activeTabIndex + 1} / {totalTabs}
            </span>
            <button
              type="button"
              onClick={onNext}
              disabled={activeTabIndex === totalTabs - 1}
              aria-label="Next section"
              className="focus-field inline-flex h-8 w-8 items-center justify-center rounded-lg border border-divider text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {isDirty && !busy ? (
            <UnsavedPill label="Unsaved changes" />
          ) : lastSaved && !isDirty ? (
            <SavedPill
              at={lastSaved.getTime()}
              format={(seconds) =>
                seconds < 60
                  ? "Saved just now"
                  : seconds < 3600
                    ? `Saved ${Math.floor(seconds / 60)} min ago`
                    : `Saved ${Math.floor(seconds / 3600)}h ago`
              }
            />
          ) : (
            <span className="text-text-muted">No changes</span>
          )}
        </>
      }
    >
      <button type="button" onClick={onCancel} className={BTN_DANGER}>
        Cancel
      </button>

      <button type="button" onClick={onSaveDraft} disabled={busy} className={BTN_SECONDARY}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <EyeOff className="h-4 w-4 text-text-muted" aria-hidden="true" />
        )}
        Save draft
      </button>

      <button type="button" onClick={onSavePublish} disabled={busy} className={BTN_PRIMARY}>
        {busy ? (
          <ButtonBusy label={phase === "uploading" ? "Uploading…" : "Saving…"} />
        ) : (
          <>
            <Eye className="h-4 w-4" aria-hidden="true" />
            {isPublished ? "Save changes" : "Save & publish"}
          </>
        )}
      </button>
    </StickyActionBar>
  );
}
