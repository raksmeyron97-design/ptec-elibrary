"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { ConfirmDialog } from "@/components/admin/kit";
import EbookCover from "@/components/admin/ebooks/EbookCover";
import { assessFeatureEligibility, type FeatureEligibilityInput } from "@/lib/books/featured";

export type FeatureTarget = FeatureEligibilityInput & {
  id: string;
  title: string;
  coverUrl: string | null;
  author: string | null;
  /** Where it will land — the current shelf size plus one. */
  nextPosition: number;
};

/**
 * "Add to Featured", with the consequence stated.
 *
 * A curation control has no undo the reader will not see: between the click
 * and the librarian noticing, the book is on the front of /books. So the
 * dialog shows the book, names the destination in the reader's words
 * ("Featured by PTEC Library"), and states the position it will take — the
 * three things that make the click checkable rather than hopeful.
 *
 * It also re-asks the eligibility question rather than trusting the caller to
 * have hidden the control. Same pure function the Server Action runs against
 * the live row, so the refusal here is a preview of the server's, never a
 * second rule.
 */
export default function FeatureBookDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: FeatureTarget | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminEbooks.featureDialog");
  if (!target) return null;

  const { eligible, blockers } = assessFeatureEligibility(target);

  return (
    <ConfirmDialog
      open
      tone="brand"
      title={t("title")}
      description={
        <>
          <div className="mb-3 flex items-start gap-3 rounded-lg border border-divider bg-paper p-2.5">
            <EbookCover coverUrl={target.coverUrl} title={target.title} className="h-14 w-10 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-heading">{target.title}</p>
              <p className="truncate text-xs text-text-muted">{target.author ?? t("noAuthor")}</p>
            </div>
          </div>
          {eligible ? (
            <>
              <p className="flex items-center gap-1.5 text-sm text-text-body">
                <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                {t("destination")}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {t("position", { position: target.nextPosition })}
              </p>
            </>
          ) : (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-text">
              {t(`blocked.${blockers[0]}`)}
            </p>
          )}
        </>
      }
      confirmLabel={t("confirm")}
      busyLabel={t("busy")}
      busy={busy || !eligible}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
