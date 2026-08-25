"use client";

import { useTranslations } from "next-intl";
import { Eye, Send, Check } from "lucide-react";
import {
  StickyActionBar,
  ButtonBusy,
  BlockingPill,
  SaveStatus,
  BTN_PRIMARY,
  BTN_SECONDARY,
} from "@/components/admin/kit/form";
import type { AutosaveStatus } from "./ThesisAutosaveStatus";
import { THESIS_STEPS, type ThesisStepKey } from "./thesis-steps";
import type { ThesisStatus } from "@/lib/admin/theses-shared";

/**
 * The thesis form's action bar, now the shared bottom bar rather than a strip
 * stuck under the page header.
 *
 * It moved because the top bar was only reachable from the top: on a
 * seven-section form, saving meant scrolling back past everything you had just
 * filled in. The bottom bar is the one element always on screen, which also
 * makes it the honest home for save state — hence the status pills on the left
 * instead of a banner six sections up.
 *
 * Buttons are real submit buttons distinguished by `name="intent"`, so
 * ThesisForm's onSubmit can read `event.nativeEvent.submitter` and set the
 * status it implies:
 *
 *   draft    always saves as a draft, whatever the Review step has selected
 *   publish  publishes, whatever the Review step has selected
 *   submit   honours the Review step's selection (Schedule, and saving an
 *            already-live thesis)
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
  activeStep,
  /** Human labels for the required things still missing, e.g. ["Title", "PDF file"]. */
  missingForPublish,
}: {
  isEdit: boolean;
  status: ThesisStatus;
  scheduledAtSet: boolean;
  wasPublished: boolean;
  submitting: boolean;
  onPreview: () => void;
  autosaveStatus?: AutosaveStatus;
  lastSavedAt?: number | null;
  activeStep: ThesisStepKey;
  missingForPublish: string[];
}) {
  const t = useTranslations("adminThesisForm.actions");
  const tAuto = useTranslations("adminThesisForm.autosave");
  const tSteps = useTranslations("adminThesisForm.steps");

  const isScheduling = status === "scheduled";
  const isLive = isEdit && wasPublished;
  const publishBlocked = missingForPublish.length > 0;

  const primaryIntent = isScheduling || isLive ? "submit" : "publish";
  const primaryLabel = isScheduling ? t("schedule") : isLive ? t("update") : t("publish");
  const primaryDisabled =
    submitting || (isScheduling && !scheduledAtSet) || (primaryIntent === "publish" && publishBlocked);

  const hintId = "thesis-primary-hint";
  const disabledReason = isScheduling && !scheduledAtSet
    ? t("scheduleNeedsDate")
    : primaryIntent === "publish" && publishBlocked
      ? t("publishNeeds", { fields: missingForPublish.join(", ") })
      : null;

  const stepIndex = THESIS_STEPS.findIndex((s) => s.key === activeStep);

  return (
    <StickyActionBar
      status={
        <>
          <span className="font-medium tabular-nums text-text-muted">
            {tSteps("progressStep", { current: stepIndex + 1, total: THESIS_STEPS.length })}
          </span>

          {/* Blocking count as a pill, next to the button it is blocking. The
              fields themselves are named in the hint below — a count alone
              tells the author they are stuck without saying on what. */}
          {publishBlocked && !isLive && (
            <BlockingPill label={t("blockingCount", { count: missingForPublish.length })} />
          )}

          {/*
            "unsaved" and "saving" used to share one grey pill, so the moment an
            autosave actually fired was invisible — the state the author most
            wants confirmed looked identical to the state before it.
          */}
          <SaveStatus
            state={
              submitting || autosaveStatus === "saving"
                ? "saving"
                : autosaveStatus === "error"
                  ? "error"
                  : autosaveStatus === "unsaved"
                    ? "dirty"
                    : lastSavedAt
                      ? "saved"
                      : "idle"
            }
            savedAt={lastSavedAt ?? null}
            labels={{
              idle: tAuto("idleLabel"),
              dirty: tAuto("unsaved"),
              saving: tAuto("saving"),
              error: tAuto("error"),
              savedAgo: (seconds) =>
                seconds < 60
                  ? tAuto("lastSavedJustNow")
                  : seconds < 3600
                    ? tAuto("lastSavedMinutes", { count: Math.floor(seconds / 60) })
                    : tAuto("lastSavedHours", { count: Math.floor(seconds / 3600) }),
            }}
          />

          {/*
            A greyed-out primary with no stated reason reads as a broken page,
            and a `title` tooltip is invisible to touch and to a screen reader
            that is not hovering. The reason is on the page, and names the
            fields rather than counting them.
          */}
          {disabledReason && (
            <p id={hintId} className="w-full text-xs text-text-muted sm:w-auto">
              {disabledReason}
            </p>
          )}
        </>
      }
    >
      {/* Tertiary. A modal, not a new tab — a tab would leave the form behind
          in a state the preview cannot reflect. */}
      <button type="button" onClick={onPreview} disabled={submitting} className={BTN_SECONDARY}>
        <Eye className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t("preview")}</span>
      </button>

      {/* Secondary. Always available, so a form that cannot publish yet is
          never a dead end. On a live thesis, saving as a draft *is* an
          unpublish, and the label says so rather than hiding it. */}
      <button type="submit" name="intent" value="draft" disabled={submitting} className={BTN_SECONDARY}>
        {isLive ? t("unpublish") : t("saveDraft")}
      </button>

      {/* Primary, last in DOM order and rightmost. */}
      <button
        type="submit"
        name="intent"
        value={primaryIntent}
        disabled={primaryDisabled}
        aria-describedby={disabledReason ? hintId : undefined}
        className={BTN_PRIMARY}
      >
        {submitting ? (
          <ButtonBusy label={t("saving")} />
        ) : (
          <>
            {primaryIntent === "publish" ? (
              <Send className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {primaryLabel}
          </>
        )}
      </button>
    </StickyActionBar>
  );
}
