"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import {
  approveBookDescription,
  discardBookDescriptionDraft,
  saveBookDescriptionDraft,
  type DescriptionReviewResult,
} from "@/app/actions/description-review";

const ERROR_KEY = {
  forbidden: "errorForbidden",
  rate_limited: "errorRateLimited",
  no_draft: "errorNoDraft",
  needs_review: "errorNeedsReview",
  not_found: "errorNotFound",
  failed: "errorFailed",
} as const;

/**
 * One book in the description review queue (SEO Phase 5.2): its current
 * description, how many books share it, and the drafts. Saving, approving and
 * discarding are offered only to someone the registry allows
 * (`books.description.review`); others see the queue read-only.
 */
export default function DescriptionReviewRow({
  bookId,
  slug,
  title,
  views,
  sameTemplate,
  description,
  status,
  draftEn,
  draftKm,
  draftSource,
}: {
  bookId: string;
  slug: string;
  title: string;
  views: number;
  sameTemplate: number;
  description: string | null;
  status: "none" | "draft" | "approved";
  draftEn: string;
  draftKm: string;
  /** Who wrote the stored draft: 'extracted' is rule-built from the book's
   *  contents page (scripts/seo-draft-book-descriptions.ts). */
  draftSource: string | null;
}) {
  const t = useTranslations("adminDataQuality.descriptions");
  const canReview = useCan("books.description.review");
  const router = useRouter();
  const [en, setEn] = useState(draftEn);
  const [km, setKm] = useState(draftKm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (
    action: () => Promise<DescriptionReviewResult>,
    okKey: "saved" | "approved" | "discarded",
    onSuccess?: () => void,
  ) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        onSuccess?.();
        setMessage({ ok: true, text: t(okKey) });
        router.refresh();
      } else {
        setMessage({ ok: false, text: t(ERROR_KEY[result.code]) });
      }
    });
  };

  const statusLabel = t(status === "approved" ? "statusApproved" : status === "draft" ? "statusDraft" : "statusNone");
  const field = "w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[14px] leading-relaxed text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60";

  return (
    <article className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15.5px] font-semibold text-text-heading">{title}</h2>
        <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-muted">
          <span>{t("views", { count: views })}</span>
          <span aria-hidden="true">·</span>
          {/* An empty description has no template to share; the body says so. */}
          {description?.trim() && (
            <>
              <span>{t("template", { count: sameTemplate })}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span className="rounded-full border border-divider px-2 py-0.5 font-semibold">{statusLabel}</span>
          {draftSource === "extracted" && (
            <span className="rounded-full border border-divider px-2 py-0.5">{t("sourceExtracted")}</span>
          )}
          <a href={`/books/${slug}`} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
            {t("openBook")}
          </a>
        </p>
      </header>
      <p className="mt-3 text-[11.5px] font-bold uppercase tracking-wide text-text-muted">{t("current")}</p>
      <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-text-body">
        {description?.trim() || <span className="italic text-text-muted">{t("emptyDescription")}</span>}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block text-[12.5px] font-semibold text-text-heading">
          {t("draftEn")}
          <textarea className={`${field} mt-1`} rows={5} lang="en" value={en} disabled={!canReview || pending} onChange={(e) => setEn(e.target.value)} />
        </label>
        <label className="block text-[12.5px] font-semibold text-text-heading">
          {t("draftKm")}
          <textarea className={`${field} mt-1 font-kh`} rows={5} lang="km" value={km} disabled={!canReview || pending} onChange={(e) => setKm(e.target.value)} />
        </label>
      </div>
      {canReview && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => saveBookDescriptionDraft(bookId, { en, km }), "saved")}
            className="h-9 rounded-lg border border-divider px-4 text-[13px] font-semibold text-text-body hover:border-brand/40 disabled:opacity-50"
          >
            {t("save")}
          </button>
          <button
            type="button"
            disabled={pending || status !== "draft"}
            onClick={() => run(() => approveBookDescription(bookId), "approved")}
            className="h-9 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {t("approve")}
          </button>
          {(draftEn || draftKm) && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => discardBookDescriptionDraft(bookId), "discarded", () => {
                  // The fields are seeded from the stored draft once; a
                  // discard must empty them, or the text it removed stays.
                  setEn("");
                  setKm("");
                })
              }
              className="h-9 rounded-lg px-3 text-[13px] font-semibold text-danger-text hover:underline disabled:opacity-50"
            >
              {t("discard")}
            </button>
          )}
          {/* Always mounted: a live region inserted together with its text is
              often not announced. */}
          <span role="status" className={`text-[13px] ${message?.ok ? "text-success-text" : "text-danger-text"}`}>
            {message?.text}
          </span>
        </div>
      )}
    </article>
  );
}
