/**
 * Phase 10 on the server: a reader renews their own loan (10.1) and places
 * and cancels their own holds (10.2) — docs/KOHA-READER-SERVICES.md.
 * Server-only — the configured client and the service database client.
 *
 * Four rules:
 *   • The patron is the one LINKED to the signed-in reader (koha_patron_links,
 *     by profile id). The browser sends only a loan number, a hold number or
 *     a catalogue slug. A loan or hold number must be in the reader's own
 *     loans or holds read NOW — so a stale page or a guessed number is "not
 *     found" before anything is sent to Koha. (The plugin checks ownership
 *     again inside Koha.) A slug is resolved to a Koha record here, never
 *     taken from the browser as a Koha id.
 *   • Every act is sent once (renewals.ts, holds.ts). A timeout is settled by
 *     reading, never by sending again.
 *   • Every attempt leaves one audit row — done, refused or failed — with the
 *     reader's profile, Koha's ids and Koha's code, and nothing else: no
 *     title, no slug, no card number (approved 2026-09-29).
 *   • The cached loans and holds are forgotten after any attempt, so the
 *     panel shows Koha's state, not the minute-old copy.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getKohaClient } from "./index";
import {
  forgetPatron, freshHolds, freshLoans, holdableRecord, kohaHoldsForReaders, kohaRenewsForReaders, linkedPatron, PATRON_READ_BUDGET_MS,
} from "./patron-server";
import { renewLoan, type RenewOutcome } from "./renewals";
import { cancelHold, placeHold, type CancelOutcome, type PlaceOutcome } from "./holds";
import type { HoldView, LoanView } from "./patrons";
import type { HoldResult, RenewResult } from "@/lib/dashboard/library-loans";

type AuditStatus = "success" | "denied" | "failed";
type Action = "renew" | "hold_place" | "hold_cancel";

/**
 * One activity_events row per attempt. `ids` holds Koha's numbers and
 * nothing else a reader typed. Never throws: a failed audit must not undo
 * what Koha did.
 */
async function record(profileId: string, action: Action, status: AuditStatus, code: string | null, ids: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await createServiceClient().from("activity_events").insert({
      event_type: "circulation",
      event_status: status,
      resource_type: "account",
      user_id: profileId,
      metadata: { action, ...ids, code },
    });
    // 42P01/PGRST205 = no activity_events yet (0094 pending): degrade quietly.
    if (error && !["42P01", "PGRST205"].includes(error.code ?? "")) console.error(`[koha ${action} audit]`, error.message);
  } catch (err) {
    console.error(`[koha ${action} audit]`, err instanceof Error ? err.message : err);
  }
}

function recordRenewal(profileId: string, patronId: number | null, loan: Pick<LoanView, "checkoutId" | "itemId" | "biblioId"> | null, checkoutId: number, status: AuditStatus, code: string | null, extra: Record<string, unknown> = {}): Promise<void> {
  return record(profileId, "renew", status, code, {
    koha_patron_id: patronId,
    koha_checkout_id: checkoutId,
    koha_item_id: loan?.itemId ?? null,
    koha_biblio_id: loan?.biblioId ?? null,
    ...extra,
  });
}

const AUDIT: Record<RenewOutcome["status"] | PlaceOutcome["status"] | CancelOutcome["status"], AuditStatus> = {
  renewed: "success",
  placed: "success",
  cancelled: "success",
  cancellation_requested: "success",
  refused: "denied",
  not_found: "denied",
  unconfirmed: "failed",
  unavailable: "failed",
};

/** The audit code of an outcome: Koha's refusal, or what went wrong; null when it was done. */
const codeOf = (o: RenewOutcome | PlaceOutcome | CancelOutcome): string | null =>
  o.status === "refused" ? o.code
    : o.status === "unconfirmed" ? o.kind
    : o.status === "unavailable" ? (o.kohaErrorCode ?? o.kind)
    : null;

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

  const code = codeOf(outcome);
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

/**
 * Place a hold on the Physical Library title `slug` for the signed-in reader.
 * The page offers it only when no copy is on the shelf; the plugin refuses
 * with `copy_on_shelf` if one came back since (PTEC's rule, 2026-09-29).
 */
export async function placeHoldForReader(profileId: string, slug: string): Promise<HoldResult> {
  if (!kohaHoldsForReaders()) return { status: "off" };
  const audit = (status: AuditStatus, code: string | null, ids: Record<string, unknown>) => record(profileId, "hold_place", status, code, ids);

  const title = await holdableRecord(slug);
  if (title === "unavailable") {
    await audit("failed", "record_unavailable", { koha_patron_id: null, koha_biblio_id: null });
    return { status: "unavailable" };
  }
  if (!title) {
    await audit("denied", "not_holdable", { koha_patron_id: null, koha_biblio_id: null });
    return { status: "not_found" };
  }
  const ids = { koha_biblio_id: title.biblioId };

  const link = await linkedPatron(profileId);
  if (link === "unavailable") {
    await audit("failed", "link_unavailable", { koha_patron_id: null, ...ids });
    return { status: "unavailable" };
  }
  if (!link) {
    await audit("denied", "not_linked", { koha_patron_id: null, ...ids });
    return { status: "not_found" };
  }

  let before: HoldView[];
  try {
    before = await freshHolds(link.patronId);
  } catch {
    await audit("failed", "holds_unavailable", { koha_patron_id: link.patronId, ...ids });
    return { status: "unavailable" };
  }
  // One hold per reader per title, whatever the lending rule would allow: a
  // double press, or a second tab, is not a second place in the queue.
  const existing = before.find((h) => h.biblioId === title.biblioId);
  if (existing) {
    await audit("denied", "already_held", { koha_patron_id: link.patronId, koha_hold_id: existing.holdId, ...ids });
    return { status: "refused", code: "already_held" };
  }

  const outcome = await placeHold(getKohaClient(), link.patronId, title.biblioId, before, { settleSignal: AbortSignal.timeout(PATRON_READ_BUDGET_MS) });
  forgetPatron(link.patronId);
  const code = codeOf(outcome);
  await audit(AUDIT[outcome.status], code, {
    koha_patron_id: link.patronId,
    koha_hold_id: outcome.status === "placed" ? outcome.holdId : null,
    ...ids,
    ...(outcome.status === "placed" && outcome.confirmedAfterTimeout ? { confirmed_after_timeout: true } : {}),
  });
  if (outcome.status === "unavailable" || outcome.status === "unconfirmed") console.error(`[koha hold_place] ${outcome.status}: ${code}`);

  switch (outcome.status) {
    case "placed": return { status: "placed", priority: outcome.priority };
    case "refused": return { status: "refused", code: outcome.code };
    case "not_found": return { status: "not_found" };
    case "unconfirmed": return { status: "unconfirmed" };
    case "unavailable": return { status: "unavailable" };
  }
}

/**
 * Cancel one of the signed-in reader's own holds. A hold not yet found is
 * cancelled; one waiting on the hold shelf becomes a cancellation request the
 * desk confirms (approved 2026-09-29) — the plugin decides which.
 */
export async function cancelHoldForReader(profileId: string, holdId: number): Promise<HoldResult> {
  if (!kohaHoldsForReaders()) return { status: "off" };
  const audit = (status: AuditStatus, code: string | null, ids: Record<string, unknown>) => record(profileId, "hold_cancel", status, code, { koha_hold_id: holdId, ...ids });

  const link = await linkedPatron(profileId);
  if (link === "unavailable") {
    await audit("failed", "link_unavailable", { koha_patron_id: null, koha_biblio_id: null });
    return { status: "unavailable" };
  }
  if (!link) {
    await audit("denied", "not_linked", { koha_patron_id: null, koha_biblio_id: null });
    return { status: "not_found" };
  }

  let holds: HoldView[];
  try {
    holds = await freshHolds(link.patronId);
  } catch {
    await audit("failed", "holds_unavailable", { koha_patron_id: link.patronId, koha_biblio_id: null });
    return { status: "unavailable" };
  }
  const hold = holds.find((h) => h.holdId === holdId);
  if (!hold) {
    await audit("denied", "not_own_hold", { koha_patron_id: link.patronId, koha_biblio_id: null });
    return { status: "not_found" };
  }
  // Already asked: the desk has it. Not a second request, and not an error.
  if (hold.cancellationRequested) {
    await audit("denied", "already_requested", { koha_patron_id: link.patronId, koha_biblio_id: hold.biblioId });
    return { status: "cancellation_requested" };
  }

  const outcome = await cancelHold(getKohaClient(), link.patronId, hold, { settleSignal: AbortSignal.timeout(PATRON_READ_BUDGET_MS) });
  forgetPatron(link.patronId);
  const code = codeOf(outcome);
  await audit(AUDIT[outcome.status], code, {
    koha_patron_id: link.patronId,
    koha_biblio_id: hold.biblioId,
    ...(outcome.status === "cancelled" || outcome.status === "cancellation_requested" ? { outcome: outcome.status } : {}),
    ...((outcome.status === "cancelled" || outcome.status === "cancellation_requested") && outcome.confirmedAfterTimeout ? { confirmed_after_timeout: true } : {}),
  });
  if (outcome.status === "unavailable" || outcome.status === "unconfirmed") console.error(`[koha hold_cancel] ${outcome.status}: ${code}`);

  switch (outcome.status) {
    case "cancelled": return { status: "cancelled" };
    case "cancellation_requested": return { status: "cancellation_requested" };
    case "refused": return { status: "refused", code: outcome.code };
    case "not_found": return { status: "not_found" };
    case "unconfirmed": return { status: "unconfirmed" };
    case "unavailable": return { status: "unavailable" };
  }
}
