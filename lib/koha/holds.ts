/**
 * Phase 10.2: a reader places a hold on a title and cancels their own holds.
 * Pure — the client is injected; reader-services.ts supplies the reader's
 * linked patron, the record, and the audit row.
 *
 * Through the PTEC Reader Services Koha plugin only (ptec-koha-deployment,
 * docs/08-READER-SERVICES.md). Koha's own POST /holds needs the whole
 * reserveforothers module, whose place_holds also lists and cancels every
 * patron's holds; Koha's DELETE /holds/{id} cancels any hold — even one
 * waiting on the shelf — without asking whose it is. The plugin:
 *   • places a title-level hold for the named reader, picked up at their own
 *     library, under Koha's rules and the OPAC's switch, and ONLY when no copy
 *     can be borrowed off the shelf (PTEC's rule, approved 2026-09-29);
 *   • cancels the reader's own hold if it is not yet found, and turns a hold
 *     WAITING on the shelf into a cancellation request the librarian confirms.
 *
 * The rules of renewals.ts hold here too: sent ONCE, a lost answer settled by
 * READING the reader's holds, Koha's code passed through, and a 403 without a
 * code is a configuration fault, not a refusal.
 */
import type { KohaClient } from "./client";
import { kohaPath } from "./client";
import { KohaError, type KohaErrorKind } from "./errors";
import { readHolds, type HoldView } from "./patrons";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);

export const holdsPath = (patronId: number) => kohaPath("/contrib/ptec/patrons/{p}/holds", { p: patronId });
export const holdPath = (patronId: number, holdId: number) => kohaPath("/contrib/ptec/patrons/{p}/holds/{h}", { p: patronId, h: holdId });

const isPlaced = (v: unknown): v is Record<string, unknown> => isObj(v) && Number.isInteger(v.hold_id);
const isCancelled = (v: unknown): v is Record<string, unknown> => isObj(v) && Number.isInteger(v.hold_id) && typeof v.outcome === "string";

/** Koha may have acted: the request left, and no answer came back that says otherwise. */
const isAmbiguous = (e: KohaError) => e.kind === "timeout" || e.kind === "unreachable" || e.kind === "server";
const asKohaError = (e: unknown, where: string) => (e instanceof KohaError ? e : new KohaError("unreachable", `Koha call failed (${where}).`));

type Failed =
  | { status: "refused"; code: string }
  | { status: "not_found" }
  | { status: "unconfirmed"; kind: KohaErrorKind }
  | { status: "unavailable"; kind: KohaErrorKind; kohaErrorCode?: string };

/** The answers every act shares: Koha's refusal, "not found", or a configuration fault. */
function settled(err: KohaError, notFoundCode: string): Failed | null {
  if (err.kind === "forbidden" && err.kohaErrorCode) return { status: "refused", code: err.kohaErrorCode };
  if (err.kind === "not_found" && err.kohaErrorCode === notFoundCode) return { status: "not_found" };
  if (isAmbiguous(err)) return null; // the caller reads
  return { status: "unavailable", kind: err.kind, kohaErrorCode: err.kohaErrorCode };
}

export type PlaceOutcome = { status: "placed"; holdId: number; priority: number | null; confirmedAfterTimeout: boolean } | Failed;

/**
 * Place a hold on `biblioId` for `patronId` — sent once. `before` must be the
 * reader's holds read just before: a hold on this record that is NOT among
 * them is the one this request made, which is how a lost answer is settled.
 */
export async function placeHold(
  koha: KohaClient,
  patronId: number,
  biblioId: number,
  before: readonly Pick<HoldView, "holdId">[],
  opts: { signal?: AbortSignal; settleSignal?: AbortSignal } = {},
): Promise<PlaceOutcome> {
  try {
    const r = await koha.write("POST", holdsPath(patronId), { biblio_id: biblioId }, isPlaced, { signal: opts.signal });
    return { status: "placed", holdId: r.data.hold_id as number, priority: int(r.data.priority), confirmedAfterTimeout: false };
  } catch (e) {
    const err = asKohaError(e, "place hold");
    const answer = settled(err, "biblio_not_found");
    if (answer) return answer;
    try {
      const known = new Set(before.map((h) => h.holdId));
      const made = (await readHolds(koha, patronId, opts.settleSignal)).find((h) => h.biblioId === biblioId && !known.has(h.holdId));
      if (made) return { status: "placed", holdId: made.holdId, priority: made.priority, confirmedAfterTimeout: true };
    } catch {
      // Could not read either: still unknown.
    }
    return { status: "unconfirmed", kind: err.kind };
  }
}

export type CancelOutcome = { status: "cancelled" | "cancellation_requested"; confirmedAfterTimeout: boolean } | Failed;

/**
 * Cancel the reader's own hold — sent once. The plugin decides which: a hold
 * not yet found is cancelled; one waiting on the shelf becomes a cancellation
 * request, if the library's rule allows one.
 */
export async function cancelHold(
  koha: KohaClient,
  patronId: number,
  hold: Pick<HoldView, "holdId" | "cancellationRequested">,
  opts: { signal?: AbortSignal; settleSignal?: AbortSignal } = {},
): Promise<CancelOutcome> {
  try {
    const r = await koha.write("DELETE", holdPath(patronId, hold.holdId), undefined, isCancelled, { signal: opts.signal });
    return { status: r.data.outcome === "cancellation_requested" ? "cancellation_requested" : "cancelled", confirmedAfterTimeout: false };
  } catch (e) {
    const err = asKohaError(e, "cancel hold");
    const answer = settled(err, "hold_not_found");
    if (answer) return answer;
    try {
      const after = (await readHolds(koha, patronId, opts.settleSignal)).find((h) => h.holdId === hold.holdId);
      if (!after) return { status: "cancelled", confirmedAfterTimeout: true };
      if (after.cancellationRequested && !hold.cancellationRequested) return { status: "cancellation_requested", confirmedAfterTimeout: true };
    } catch {
      // Could not read either: still unknown.
    }
    return { status: "unconfirmed", kind: err.kind };
  }
}
