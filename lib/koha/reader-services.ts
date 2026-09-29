/**
 * Phase 10.1 on the server: a reader renews their own loan
 * (docs/KOHA-READER-SERVICES.md). Server-only — the configured client and the
 * service database client.
 *
 * Four rules:
 *   • The patron is the one LINKED to the signed-in reader (koha_patron_links,
 *     by profile id). The browser sends only a loan number, and that number
 *     must be in the reader's own loans read NOW — so a stale page or a
 *     guessed number is "not found" before anything is sent to Koha. (The
 *     plugin checks ownership again inside Koha.)
 *   • One renewal is sent once (renewals.ts). A timeout is settled by reading,
 *     never by sending again.
 *   • Every attempt leaves one audit row — renewed, refused or failed — with
 *     the reader's profile, Koha's ids and Koha's code, and nothing else: no
 *     title, no card number (approved 2026-09-29).
 *   • The cached loans are forgotten after any attempt, so the panel shows
 *     Koha's state, not the minute-old copy.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getKohaClient } from "./index";
import { forgetPatron, freshLoans, kohaRenewsForReaders, linkedPatron, PATRON_READ_BUDGET_MS } from "./patron-server";
import { renewLoan, type RenewOutcome } from "./renewals";
import type { LoanView } from "./patrons";
import type { RenewResult } from "@/lib/dashboard/library-loans";

type AuditStatus = "success" | "denied" | "failed";

/** One activity_events row per renewal attempt. Never throws: a failed audit must not undo a renewal. */
async function recordRenewal(profileId: string, patronId: number | null, loan: Pick<LoanView, "checkoutId" | "itemId" | "biblioId"> | null, checkoutId: number, status: AuditStatus, code: string | null, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    const { error } = await createServiceClient().from("activity_events").insert({
      event_type: "circulation",
      event_status: status,
      resource_type: "account",
      user_id: profileId,
      metadata: {
        action: "renew",
        koha_patron_id: patronId,
        koha_checkout_id: checkoutId,
        koha_item_id: loan?.itemId ?? null,
        koha_biblio_id: loan?.biblioId ?? null,
        code,
        ...extra,
      },
    });
    // 42P01/PGRST205 = no activity_events yet (0094 pending): degrade quietly.
    if (error && !["42P01", "PGRST205"].includes(error.code ?? "")) console.error("[koha renew audit]", error.message);
  } catch (err) {
    console.error("[koha renew audit]", err instanceof Error ? err.message : err);
  }
}

const AUDIT: Record<RenewOutcome["status"], AuditStatus> = {
  renewed: "success",
  refused: "denied",
  not_found: "denied",
  unconfirmed: "failed",
  unavailable: "failed",
};

export async function renewForReader(profileId: string, checkoutId: number): Promise<RenewResult> {
  if (!kohaRenewsForReaders()) return { status: "off" };

  const link = await linkedPatron(profileId);
  if (link === "unavailable") {
    await recordRenewal(profileId, null, null, checkoutId, "failed", "link_unavailable");
    return { status: "unavailable" };
  }
  if (!link) {
    await recordRenewal(profileId, null, null, checkoutId, "denied", "not_linked");
    return { status: "not_found" };
  }

  let loans: LoanView[];
  try {
    loans = await freshLoans(link.patronId);
  } catch {
    await recordRenewal(profileId, link.patronId, null, checkoutId, "failed", "loans_unavailable");
    return { status: "unavailable" };
  }
  const loan = loans.find((l) => l.checkoutId === checkoutId);
  if (!loan) {
    await recordRenewal(profileId, link.patronId, null, checkoutId, "denied", "not_own_loan");
    return { status: "not_found" };
  }

  const outcome = await renewLoan(getKohaClient(), link.patronId, loan, { settleSignal: AbortSignal.timeout(PATRON_READ_BUDGET_MS) });
  forgetPatron(link.patronId);

  const code = outcome.status === "refused" ? outcome.code
    : outcome.status === "unconfirmed" ? outcome.kind
    : outcome.status === "unavailable" ? (outcome.kohaErrorCode ?? outcome.kind)
    : null;
  await recordRenewal(profileId, link.patronId, loan, checkoutId, AUDIT[outcome.status], code,
    outcome.status === "renewed" && outcome.confirmedAfterTimeout ? { confirmed_after_timeout: true } : {});
  if (outcome.status === "unavailable" || outcome.status === "unconfirmed") {
    console.error(`[koha renew] ${outcome.status}: ${code}`);
  }

  switch (outcome.status) {
    case "renewed": return { status: "renewed", dueDate: outcome.dueDate, renewals: outcome.renewals };
    case "refused": return { status: "refused", code: outcome.code };
    case "not_found": return { status: "not_found" };
    case "unconfirmed": return { status: "unconfirmed" };
    case "unavailable": return { status: "unavailable" };
  }
}
