"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Eye, Loader2, Send } from "lucide-react";
import ThesisAutosaveStatus, { ThesisLastSaved, type AutosaveStatus } from "./ThesisAutosaveStatus";
import type { ThesisStatus } from "@/lib/admin/theses-shared";

/**
 * The form's action group — one at the top of the form, and (on small screens)
 * one pinned to the bottom of the viewport.
 *
 * Buttons are real submit buttons distinguished by `name="intent"`, so
 * ThesisForm's onSubmit can read `event.nativeEvent.submitter` and set the
 * status it implies. There are three intents:
 *
 *   draft    always saves as a draft, whatever the Review step has selected
 *   publish  publishes, whatever the Review step has selected
 *   submit   honours the Review step's selection (used for Schedule, and for
 *            saving an already-live thesis)
 *
 * `publish` is new. The primary button used to inherit its meaning from a radio
 * group six steps away, so on a fresh form — status "draft" — the biggest
 * button on the page read "Save Draft" and there was no way to publish without
 * first finding the Review step. Publishing is the point of the form; it is the
 * primary action now, and the Review step's selection still wins for the cases
 * that need it.
 */
export default function ThesisStickyActions({
  isEdit,
  status,
  scheduledAtSet,
  wasPublished,
  submitting,
  onPreview,
  autosaveStatus,
  lastSavedAt,
  /** Human labels for the required things still missing, e.g. ["Title", "PDF file"]. */
  missingForPublish,
  variant = "bar",
}: {
  isEdit: boolean;
  status: ThesisStatus;
  scheduledAtSet: boolean;
  wasPublished: boolean;
  submitting: boolean;
  onPreview: () => void;
  autosaveStatus?: AutosaveStatus;
  lastSavedAt?: number | null;
  missingForPublish: string[];
  /** "bar" is the top sticky bar; "footer" is the mobile bottom bar. */
  variant?: "bar" | "footer";
}) {
  const t = useTranslations("adminThesisForm.actions");

  const isScheduling = status === "scheduled";
  const isLive = isEdit && wasPublished;
  const publishBlocked = missingForPublish.length > 0;

  // Which intent the primary carries, and therefore what it may claim to do.
  const primaryIntent = isScheduling || isLive ? "submit" : "publish";
  const primaryLabel = isScheduling ? t("schedule") : isLive ? t("update") : t("publish");
  const primaryDisabled =
    submitting ||
    (isScheduling && !scheduledAtSet) ||
    (primaryIntent === "publish" && publishBlocked);

  const hintId = `thesis-primary-hint-${useId().replace(/:/g, "")}`;
  const disabledReason = isScheduling && !scheduledAtSet
    ? t("scheduleNeedsDate")
    : primaryIntent === "publish" && publishBlocked
      ? t("publishNeeds", { fields: missingForPublish.join(", ") })
      : null;

  const isFooter = variant === "footer";

  const secondaryClass =
    "focus-field inline-flex h-10 items-center gap-1.5 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      className={
        isFooter
          ? "fixed inset-x-0 bottom-0 z-30 flex flex-col-reverse gap-2 border-t border-divider bg-bg-surface/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] backdrop-blur md:hidden"
          : "sticky top-[64px] z-20 hidden flex-wrap items-center gap-2.5 rounded-xl border border-divider bg-bg-surface/95 p-3 shadow-sm backdrop-blur md:flex"
      }
    >
      {!isFooter && (
        <div className="flex min-w-0 flex-col gap-0.5">
          <ThesisAutosaveStatus status={autosaveStatus ?? "idle"} />
          <ThesisLastSaved at={lastSavedAt ?? null} />
        </div>
      )}

      <div className={isFooter ? "flex items-center justify-end gap-2" : "ml-auto flex flex-wrap items-center gap-2.5"}>
        {/* Tertiary. A modal, not a new tab — a tab would leave the form behind
            in a state the preview cannot reflect. */}
        <button
          type="button"
          onClick={onPreview}
          disabled={submitting}
          className={`${secondaryClass} ${isFooter ? "px-3" : ""}`}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className={isFooter ? "sr-only" : undefined}>{t("preview")}</span>
        </button>

        {/* Secondary. Always available, so a form that cannot publish yet is
            never a dead end. On a live thesis, saving as a draft *is* an
            unpublish, and the label says so rather than hiding it. */}
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={submitting}
          className={secondaryClass}
        >
          {isLive ? t("unpublish") : t("saveDraft")}
        </button>

        {/* Primary, last in DOM order and rightmost. */}
        <button
          type="submit"
          name="intent"
          value={primaryIntent}
          disabled={primaryDisabled}
          aria-describedby={disabledReason ? hintId : undefined}
          title={disabledReason ?? undefined}
          className="focus-field inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            primaryIntent === "publish" && <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {submitting ? t("saving") : primaryLabel}
        </button>
      </div>

      {/*
        A greyed-out primary with no stated reason reads as a broken page, and a
        `title` tooltip is invisible to touch and to a screen reader that is not
        hovering. The reason is on the page, and names the fields rather than
        counting them.
      */}
      {disabledReason && (
        <p id={hintId} className={`w-full text-xs text-text-muted ${isFooter ? "" : "text-right"}`}>
          {disabledReason}
        </p>
      )}
    </div>
  );
}
