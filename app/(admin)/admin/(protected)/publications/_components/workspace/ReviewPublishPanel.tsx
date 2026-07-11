"use client";

// Review & publish step: the complete validation summary, separated into
// blocking errors, warnings, and recommendations. Every item navigates to the
// field that resolves it. Publishing is server-validated again regardless.

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  ShieldCheck,
} from "lucide-react";
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

const GROUPS: {
  key: "errors" | "warnings" | "recommendations";
  title: string;
  intro: string;
  icon: typeof AlertCircle;
  tone: string;
  chip: string;
}[] = [
  {
    key: "errors",
    title: "Blocking problems",
    intro: "These must be fixed before the article can be published.",
    icon: AlertCircle,
    tone: "text-danger",
    chip: "border-danger/30 bg-danger/5",
  },
  {
    key: "warnings",
    title: "Warnings",
    intro: "Publishing is possible, but these look like mistakes.",
    icon: AlertTriangle,
    tone: "text-warning",
    chip: "border-warning/30 bg-warning/5",
  },
  {
    key: "recommendations",
    title: "Recommendations",
    intro: "Optional improvements for discovery and readers.",
    icon: Info,
    tone: "text-brand",
    chip: "border-brand/20 bg-brand/5",
  },
];

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
  const clean = review.items.length === 0;
  const canPublish = isEdit && !dirty && !saving && review.publishable && !isPublished;

  const renderItem = (item: PublicationReviewItem, tone: string, chip: string) => (
    <li key={`${item.code}-${item.field ?? ""}-${item.message}`}>
      <button
        type="button"
        onClick={() => onNavigate(item.step, item.field)}
        className={`flex w-full cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] leading-5 text-text-body transition-colors hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${chip}`}
      >
        <span className={`mt-0.5 font-bold uppercase tracking-wide ${tone} text-[10px]`}>
          {item.step}
        </span>
        <span className="min-w-0 flex-1">{item.message}</span>
        <span aria-hidden="true" className="text-text-muted">→</span>
        <span className="sr-only">Go to the affected field</span>
      </button>
    </li>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-text-heading">
            <ShieldCheck className="h-4.5 w-4.5 text-brand" aria-hidden="true" />
            Publish readiness
          </h3>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            {isPublished
              ? "This article is live. Saved changes appear on the public page immediately."
              : "The article stays private until it passes this review and is published."}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${
            isPublished
              ? "bg-success/10 text-success"
              : review.publishable
                ? "bg-brand/10 text-brand"
                : "bg-danger/10 text-danger"
          }`}
        >
          {isPublished ? (
            <>
              <Globe className="h-3.5 w-3.5" aria-hidden="true" /> Published
            </>
          ) : review.publishable ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Ready to publish
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {review.errors.length} blocking problem{review.errors.length === 1 ? "" : "s"}
            </>
          )}
        </span>
      </div>

      {publishError ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12.5px] font-medium text-danger">
          {publishError}
        </p>
      ) : null}

      {clean ? (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-6 text-[13px] font-medium text-text-body">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          Everything checks out — no problems, warnings, or missing recommendations.
        </p>
      ) : (
        GROUPS.map((group) => {
          const items = review[group.key];
          if (items.length === 0) return null;
          return (
            <section key={group.key} aria-label={group.title}>
              <h4 className={`flex items-center gap-1.5 text-[13px] font-bold ${group.tone}`}>
                <group.icon className="h-4 w-4" aria-hidden="true" />
                {group.title} ({items.length})
              </h4>
              <p className="mt-0.5 text-[11.5px] text-text-muted">{group.intro}</p>
              <ul className="mt-2 space-y-1.5">
                {items.map((item) => renderItem(item, group.tone, group.chip))}
              </ul>
            </section>
          );
        })
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
        {isPublished ? (
          <>
            {publicHref ? (
              <a
                href={publicHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-divider px-3.5 text-[13px] font-semibold text-text-body transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open public page
              </a>
            ) : null}
            <button
              type="button"
              disabled={publishing}
              onClick={onUnpublish}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-warning/50 px-3.5 text-[13px] font-semibold text-warning transition-colors hover:bg-warning/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              Unpublish
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={!canPublish || publishing}
              onClick={onPublish}
              title={
                !isEdit
                  ? "Save the article first"
                  : dirty
                    ? "Save your changes first"
                    : !review.publishable
                      ? "Fix the blocking problems first"
                      : "Publish this article"
              }
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Globe className="h-4 w-4" aria-hidden="true" />
              )}
              {publishing ? "Publishing…" : "Publish article"}
            </button>
            {!isEdit ? (
              <p className="text-[12px] text-text-muted">Save the article first, then publish it from here.</p>
            ) : dirty ? (
              <p className="text-[12px] text-text-muted">Save your changes first — publishing uses the saved version.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
