"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff, ShieldAlert, ClipboardCheck, AlertCircle } from "lucide-react";
import { useToast } from "@/components/admin/kit";
import { ButtonBusy, BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER } from "@/components/admin/kit/form";
import type { QualityReport } from "@/lib/metadata-quality";
import { verifyThesis, unverifyThesis, submitThesisForReview } from "@/app/actions/theses";

/**
 * Verification & quality card for the thesis editor — the theses counterpart of
 * components/admin/ebooks/BookVerifyPanel.tsx.
 *
 * Two deliberate differences from the book panel, both forced by this form's
 * shape rather than by taste:
 *
 * 1. It is a card, not a ReviewDashboard. The Review step already renders one
 *    ReviewDashboard for publish-readiness; a second verdict banner directly
 *    beneath it would make the step open with two big coloured banners
 *    answering different questions, and leave the reader to work out which
 *    verdict was which. Verification is the smaller of the two decisions, so
 *    it gets the same card shape as its slot-mate, DownloadAccessCard.
 *
 * 2. The checklist is evaluated on the server, from the saved research_reports
 *    row, and arrives as a prop. The book form has no draft layer, so its panel
 *    can score live field values; a thesis autosaves to a separate
 *    thesis_drafts table (migration 0076) that is explicitly never pushed onto
 *    a published row. The saved row is therefore the only thing the stamp can
 *    be about, and scoring anything else would show a verdict about text that
 *    is not what would be verified.
 */
export default function ThesisVerifyPanel({
  thesisId,
  quality,
  status,
  verifiedAt,
  verifierName,
}: {
  thesisId: string;
  /** Evaluated server-side from the saved row (lib/metadata-quality.ts). */
  quality: QualityReport;
  status: string;
  verifiedAt: string | null;
  verifierName: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<null | "verify" | "unverify" | "submit">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const blockers = quality.items.filter((i) => i.required && i.status === "missing");
  const blocked = blockers.length > 0;
  const isVerified = Boolean(verifiedAt);

  async function run(kind: "verify" | "unverify" | "submit") {
    setBusy(kind);
    setActionError(null);
    try {
      const result =
        kind === "verify"
          ? await verifyThesis(thesisId)
          : kind === "unverify"
            ? await unverifyThesis(thesisId)
            : await submitThesisForReview(thesisId);
      if (!result.success) {
        setActionError(result.error ?? "Action failed");
        return;
      }
      toast.success(
        kind === "verify"
          ? "Metadata verified."
          : kind === "unverify"
            ? "Verification removed."
            : "Sent to the review queue.",
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const verifiedOn = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <div className="border-b border-divider px-6 pb-4 pt-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-text-heading">
          <ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" />
          Metadata Verification
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Verifying shows the “Verified by librarian” badge on the public page, removes the “not yet
          verified” warning from the citation box, and admits this thesis to the OAI-PMH feed. It is
          separate from publishing and does not change the{" "}
          <span className="font-medium text-text-body">{status}</span> status.
        </p>
      </div>

      <div className="space-y-4 px-6 py-5">
        {/* Current state. Never colour-only — the icon and the wording each
            carry the verdict on their own. */}
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            isVerified
              ? "border-success-line bg-success-soft"
              : blocked
                ? "border-danger-line bg-danger-soft"
                : "border-warning-line bg-warning-soft"
          }`}
        >
          {isVerified ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          ) : blocked ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p
              className={`text-sm font-bold ${
                isVerified ? "text-success-text" : blocked ? "text-danger-text" : "text-warning-text"
              }`}
            >
              {isVerified ? "Verified" : blocked ? "Cannot be verified yet" : "Not verified"}
            </p>
            <p
              className={`mt-0.5 text-xs ${
                isVerified ? "text-success-text/80" : blocked ? "text-danger-text/80" : "text-warning-text/80"
              }`}
            >
              {isVerified
                ? `Stamped ${verifiedOn}${verifierName ? ` by ${verifierName}` : ""}. Readers see the trust badge and an unqualified citation.`
                : blocked
                  ? "Required metadata is missing on the saved record."
                  : `Metadata score ${quality.score}% (grade ${quality.grade}). Readers currently see a warning on the citation box.`}
            </p>
          </div>
        </div>

        {/* Only the blocking gaps are listed. The advisory ones are already the
            job of the publish-readiness dashboard directly above this card —
            repeating them here would be the same list twice on one screen. */}
        {blocked && (
          <div className="rounded-xl border border-divider">
            <p className="border-b border-divider px-4 py-2.5 text-[13px] font-semibold text-text-heading">
              Fix on the saved record before verifying
            </p>
            <ul className="divide-y divide-divider">
              {blockers.map((item) => (
                <li key={item.key} className="px-4 py-2.5 text-[13px] leading-[1.6] text-text-body">
                  {item.label} is missing
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger-text"
          >
            {actionError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
          {isVerified ? (
            <button type="button" disabled={busy !== null} onClick={() => run("unverify")} className={BTN_DANGER}>
              {busy === "unverify" ? (
                <ButtonBusy label="Removing…" />
              ) : (
                <>
                  <ShieldOff className="h-4 w-4" aria-hidden="true" />
                  Remove verification
                </>
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy !== null || blocked}
                onClick={() => run("verify")}
                aria-describedby={blocked ? "thesis-verify-blocked-reason" : undefined}
                className={BTN_PRIMARY}
              >
                {busy === "verify" ? (
                  <ButtonBusy label="Verifying…" />
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Verify metadata
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={busy !== null || status === "pending_review"}
                onClick={() => run("submit")}
                className={BTN_SECONDARY}
              >
                {busy === "submit" ? (
                  <ButtonBusy label="Submitting…" />
                ) : (
                  <>
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                    {status === "pending_review" ? "Already in the queue" : "Send to review queue"}
                  </>
                )}
              </button>
              {blocked ? (
                <p id="thesis-verify-blocked-reason" className="text-[12px] text-text-muted">
                  Fill in the fields listed above, then save.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
