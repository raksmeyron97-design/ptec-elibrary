"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff, ClipboardCheck } from "lucide-react";
import { useToast } from "@/components/admin/kit";
import {
  ReviewDashboard,
  ButtonBusy,
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_DANGER,
  type ReviewFinding,
  type ReviewTone,
} from "@/components/admin/kit/form";
import { evaluateQuality, type ChecklistItem } from "@/lib/metadata-quality";
import { verifyEbook, unverifyEbook, submitEbookForReview } from "@/app/actions/ebooks";

/**
 * Verification & quality panel for the e-book editor.
 *
 * Why this exists as its own tab rather than a line in the SEO panel: the
 * verified stamp is the only editorial signal on this form with *public*
 * consequences — it drives the "Verified by librarian" badge, removes the
 * "not yet verified" warning from the citation box, and admits the record to
 * the OAI-PMH feed. It deserves the same shape every other content type in
 * this panel gives publishing (ReviewDashboard + an action row), not a
 * checkbox.
 *
 * The findings are evaluated from the *live* form values so the librarian can
 * see a gap close as they fix it; the action itself always runs against the
 * saved row, which is why an unsaved form blocks the button rather than
 * silently verifying yesterday's metadata.
 */

/** Which tab resolves each checklist item. */
const FINDING_HOME: Record<string, { tab: "files" | "details" | "seo"; label: string }> = {
  title: { tab: "details", label: "Book Details" },
  author: { tab: "details", label: "Book Details" },
  language: { tab: "details", label: "Book Details" },
  year: { tab: "details", label: "Book Details" },
  description: { tab: "details", label: "Book Details" },
  license: { tab: "details", label: "Book Details" },
  category: { tab: "details", label: "Book Details" },
  isbn: { tab: "details", label: "Book Details" },
  pages: { tab: "details", label: "Book Details" },
  keywords: { tab: "details", label: "Book Details" },
  cover: { tab: "files", label: "Files" },
  source: { tab: "details", label: "Book Details" },
};

function toneOf(item: ChecklistItem): ReviewTone {
  if (item.required && item.status === "missing") return "blocking";
  if (item.status === "weak") return "warning";
  return "recommendation";
}

function messageOf(item: ChecklistItem): string {
  if (item.hint) return `${item.label} — ${item.hint}`;
  return item.status === "missing" ? `${item.label} is missing` : `${item.label} needs attention`;
}

export type VerifyRow = Record<string, unknown>;

export default function BookVerifyPanel({
  bookId,
  row,
  status,
  verifiedAt,
  verifierName,
  dirty,
  onNavigate,
}: {
  bookId: string;
  /** Live form values shaped like a books row, for evaluateQuality(). */
  row: VerifyRow;
  status: string;
  verifiedAt: string | null;
  verifierName: string | null;
  /** True while the form holds unsaved edits or a queued upload. */
  dirty: boolean;
  onNavigate: (tab: "files" | "details" | "seo") => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<null | "verify" | "unverify" | "submit">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const quality = evaluateQuality("book", row);

  const findings: Record<ReviewTone, ReviewFinding[]> = {
    blocking: [],
    warning: [],
    recommendation: [],
  };
  for (const item of quality.items) {
    if (item.status === "ok") continue;
    const home = FINDING_HOME[item.key];
    findings[toneOf(item)].push({
      id: item.key,
      message: messageOf(item),
      onNavigate: home ? () => onNavigate(home.tab) : undefined,
      navigateLabel: home?.label,
    });
  }

  const blocked = findings.blocking.length > 0;
  const isVerified = Boolean(verifiedAt);

  async function run(kind: "verify" | "unverify" | "submit") {
    setBusy(kind);
    setActionError(null);
    try {
      const result =
        kind === "verify"
          ? await verifyEbook(bookId)
          : kind === "unverify"
            ? await unverifyEbook(bookId)
            : await submitEbookForReview(bookId);
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

  const verifiedLine = verifiedAt
    ? `Verified ${new Date(verifiedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}${verifierName ? ` by ${verifierName}` : ""}.`
    : null;

  // Reasons the verify button cannot fire, most important first. The server
  // re-checks all of them; this is only so the librarian is told which one.
  const verifyBlockedReason = blocked
    ? "Fill in the blocking fields above first."
    : dirty
      ? "Save your changes first — verification stamps the saved version."
      : null;

  return (
    <ReviewDashboard
      findings={findings}
      verdictReady={!blocked}
      readyTitle={isVerified ? "Verified and complete" : "Ready to verify"}
      readyBody={
        isVerified
          ? `${verifiedLine} Readers see the trust badge and an unqualified citation.`
          : "Every required field is present. Verifying stamps this record and removes the citation warning."
      }
      blockedTitle="Not ready to verify"
    >
      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger-text"
        >
          {actionError}
        </p>
      ) : null}

      {/* What the stamp actually does, stated once. A librarian pressing this
          is making a public claim and should know its blast radius. */}
      <div className="rounded-xl border border-divider bg-paper px-4 py-3">
        <h3 className="text-sm font-semibold text-text-heading">What verification changes</h3>
        <ul className="mt-1.5 space-y-1 text-[12.5px] leading-[1.6] text-text-body">
          <li>· Shows the “Verified by librarian” badge on the public book page.</li>
          <li>· Removes the “not yet verified” warning from the citation box.</li>
          <li>· Admits the record to the OAI-PMH feed and metadata exports.</li>
        </ul>
        <p className="mt-2 text-[12px] text-text-muted">
          Verification is separate from publishing — it does not change this book’s{" "}
          <span className="font-medium text-text-body">{status}</span> status.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
        {isVerified ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("unverify")}
            className={BTN_DANGER}
          >
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
              disabled={busy !== null || blocked || dirty}
              onClick={() => run("verify")}
              aria-describedby={verifyBlockedReason ? "verify-blocked-reason" : undefined}
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
            {verifyBlockedReason ? (
              <p id="verify-blocked-reason" className="text-[12px] text-text-muted">
                {verifyBlockedReason}
              </p>
            ) : null}
          </>
        )}
      </div>
    </ReviewDashboard>
  );
}
