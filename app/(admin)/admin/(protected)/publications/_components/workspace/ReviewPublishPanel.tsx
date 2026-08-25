"use client";

// Review & publish step: mission control. One verdict, three grouped panels,
// every finding a link to the field that resolves it. Publishing is
// server-validated again regardless of what this says.

import { ExternalLink, Globe, Loader2 } from "lucide-react";
import { ReviewDashboard, BTN_PRIMARY, BTN_SECONDARY, ButtonBusy } from "@/components/admin/kit/form";
import type { ReviewFinding, ReviewTone } from "@/components/admin/kit/form";
import type {
  PublicationReviewItem,
  PublicationReviewResult,
  ReviewStep,
} from "@/lib/publications/review";

export interface ReviewPublishPanelProps {
  review: PublicationReviewResult;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  isEdit: boolean;
  isPublished: boolean;
  publicHref: string | null;
  /** Extra message from a failed server-side publish attempt. */
  publishError: string | null;
  onNavigate: (step: ReviewStep, field?: string) => void;
  onPublish: () => void;
  onUnpublish: () => void;
}

const STEP_LABEL: Record<ReviewStep, string> = {
  basic: "Basic info",
  authors: "Authors",
  content: "Content",
  details: "Details",
  files: "Files",
};

export default function ReviewPublishPanel({
  review,
  dirty,
  saving,
  publishing,
  isEdit,
  isPublished,
  publicHref,
  publishError,
  onNavigate,
  onPublish,
  onUnpublish,
}: ReviewPublishPanelProps) {
  const canPublish = isEdit && !dirty && !saving && review.publishable && !isPublished;

  /*
    The review model already speaks error/warning/recommendation, so this is a
    rename onto the kit's vocabulary rather than a second classification. `id`
    is the rule code plus its field, not the message — wording can change
    without React losing a row's identity mid-edit.
  */
  const toFinding = (item: PublicationReviewItem): ReviewFinding => ({
    id: `${item.code}:${item.field ?? item.step}`,
    message: item.message,
    onNavigate: () => onNavigate(item.step, item.field),
    navigateLabel: STEP_LABEL[item.step],
  });

  const findings: Record<ReviewTone, ReviewFinding[]> = {
    blocking: review.errors.map(toFinding),
    warning: review.warnings.map(toFinding),
    recommendation: review.recommendations.map(toFinding),
  };

  /*
    "Ready" is about the article's content, not about this tab's session state.
    An unsaved-but-valid article is ready; what stops the button is the save,
    and that is said on the button rather than in the verdict — conflating the
    two made a clean article report as blocked with nothing listed.
  */
  const blockedReason = !isEdit
    ? "Save the article first, then publish it from here."
    : dirty
      ? "Save your changes first — publishing uses the saved version."
      : null;

  return (
    <ReviewDashboard
      findings={findings}
      verdictReady={review.publishable}
      readyTitle={isPublished ? "Live and passing every check" : "Ready to publish"}
      readyBody={
        isPublished
          ? "This article is live. Saved changes appear on the public page immediately."
          : "Nothing blocks publication. The server re-checks on publish."
      }
      blockedTitle="Not ready to publish"
    >
      {publishError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger-text"
        >
          {publishError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
        {isPublished ? (
          <>
            {publicHref ? (
              <a href={publicHref} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open public page
              </a>
            ) : null}
            <button
              type="button"
              disabled={publishing}
              onClick={onUnpublish}
              className="focus-field inline-flex h-10 items-center gap-1.5 rounded-lg border border-warning-line px-4 text-sm font-semibold text-warning-text transition hover:bg-warning-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : null}
              Unpublish
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={!canPublish || publishing}
              onClick={onPublish}
              aria-describedby={blockedReason ? "publish-blocked-reason" : undefined}
              className={BTN_PRIMARY}
            >
              {publishing ? (
                <ButtonBusy label="Publishing…" />
              ) : (
                <>
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  Publish article
                </>
              )}
            </button>
            {blockedReason ? (
              <p id="publish-blocked-reason" className="text-[12px] text-text-muted">
                {blockedReason}
              </p>
            ) : null}
          </>
        )}
      </div>
    </ReviewDashboard>
  );
}
