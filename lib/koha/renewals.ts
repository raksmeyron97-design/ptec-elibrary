/**
 * Phase 10.1: a reader renews their own loan from the dashboard. Pure — the
 * client is injected; the server side (reader-services.ts) supplies the
 * reader's linked patron and records the audit row.
 *
 * Everything goes through the PTEC Reader Services Koha plugin
 * (ptec-koha-deployment, docs/08-READER-SERVICES.md), never Koha's own
 * renewal route: that route's permission (circulate_remaining_permissions)
 * also checks books out and rewrites the lending rules, it accepts any loan
 * number without asking whose it is, and it skips the OPAC's rules. The
 * plugin renews only the named reader's own loan, under the OPAC's rules,
 * through Koha's own renewal check with nothing overridden.
 *
 * Three rules here:
 *   • A renewal is sent ONCE (client.write never retries). A timeout is
 *     settled by READING the reader's loans — did the renewal count go up? —
 *     and if it did not, the answer is "unconfirmed", never "failed" and never
 *     a second send: Koha may still be finishing it.
 *   • A refusal is Koha's own code, passed through (too_many, on_reserve, …).
 *     A 403 WITHOUT a code is not a refusal: it is the API user lacking the
 *     permission, a configuration fault, and reads as "unavailable".
 *   • Asking whether each loan CAN be renewed is a read, and a loan Koha could
 *     not say anything about is null — the button is then offered and Koha
 *     answers when it is pressed.
 */
import type { KohaClient } from "./client";
import { kohaPath } from "./client";
import { KohaError, type KohaErrorKind } from "./errors";
import { readLoans, type LoanView } from "./patrons";
import type { RenewalView } from "@/lib/dashboard/library-loans";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);

export const renewabilityPath = (patronId: number, checkoutId: number) =>
  kohaPath("/contrib/ptec/patrons/{p}/checkouts/{c}/renewability", { p: patronId, c: checkoutId });
export const renewalPath = (patronId: number, checkoutId: number) =>
  kohaPath("/contrib/ptec/patrons/{p}/checkouts/{c}/renewal", { p: patronId, c: checkoutId });

const isVerdict = (v: unknown): v is Record<string, unknown> => isObj(v) && typeof v.allows_renewal === "boolean";
const isRenewed = (v: unknown): v is Record<string, unknown> => isObj(v) && Number.isInteger(v.checkout_id);

/** The plugin's verdict on one loan. */
export function projectVerdict(v: Record<string, unknown>): RenewalView {
  const allowed = v.allows_renewal === true;
  return {
    allowed,
    // An allowed renewal can still carry an informational code (auto_renew);
    // only a refusal's code means anything to the reader.
    code: allowed ? null : str(v.error_code),
    max: int(v.max_renewals),
    soonest: str(v.soonest_renew_date),
  };
}

export async function readRenewability(koha: KohaClient, patronId: number, checkoutId: number, signal?: AbortSignal): Promise<RenewalView> {
  const r = await koha.get(renewabilityPath(patronId, checkoutId), isVerdict, { signal });
  return projectVerdict(r.data);
}

/**
 * The verdict for each loan, two at a time (Koha runs two Plack workers, and
 * a reader's dashboard should not take both). A loan Koha could not answer
 * for is null, never "not allowed".
 */
export async function renewabilityForLoans(
  koha: KohaClient,
  patronId: number,
  checkoutIds: readonly number[],
  signal?: AbortSignal,
): Promise<Map<number, RenewalView | null>> {
  const out = new Map<number, RenewalView | null>();
  const queue = [...checkoutIds];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        out.set(id, await readRenewability(koha, patronId, id, signal));
      } catch {
        out.set(id, null);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  return out;
}

export type RenewOutcome =
  | { status: "renewed"; dueDate: string | null; renewals: number; confirmedAfterTimeout: boolean }
  | { status: "refused"; code: string }
  | { status: "not_found" }
  | { status: "unconfirmed"; kind: KohaErrorKind }
  | { status: "unavailable"; kind: KohaErrorKind; kohaErrorCode?: string };

/** Koha may have acted: the request left, and no answer came back that says otherwise. */
const isAmbiguous = (e: KohaError) => e.kind === "timeout" || e.kind === "unreachable" || e.kind === "server";

/**
 * Renew `loan` for `patronId` — sent once. `loan` must come from a fresh read
 * of THIS patron's loans (the caller's job): its renewal count is what a
 * timeout is settled against.
 */
export async function renewLoan(
  koha: KohaClient,
  patronId: number,
  loan: Pick<LoanView, "checkoutId" | "renewals">,
  opts: { signal?: AbortSignal; settleSignal?: AbortSignal } = {},
): Promise<RenewOutcome> {
  try {
    const r = await koha.write("POST", renewalPath(patronId, loan.checkoutId), undefined, isRenewed, { signal: opts.signal });
    return {
      status: "renewed",
      dueDate: str(r.data.due_date),
      renewals: int(r.data.renewals_count) ?? loan.renewals + 1,
      confirmedAfterTimeout: false,
    };
  } catch (e) {
    const err = e instanceof KohaError ? e : new KohaError("unreachable", "Koha call failed (renewal).");
    // Koha's rules said no — its code is the answer.
    if (err.kind === "forbidden" && err.kohaErrorCode) return { status: "refused", code: err.kohaErrorCode };
    // Not this reader's loan (any more): returned at the desk since the page loaded.
    if (err.kind === "not_found" && err.kohaErrorCode === "checkout_not_found") return { status: "not_found" };
    if (isAmbiguous(err)) {
      // Settle by reading, never by sending again.
      try {
        const now = await readLoans(koha, patronId, new Date(), opts.settleSignal);
        const after = now.find((l) => l.checkoutId === loan.checkoutId);
        if (after && after.renewals > loan.renewals) {
          return { status: "renewed", dueDate: after.dueDate, renewals: after.renewals, confirmedAfterTimeout: true };
        }
      } catch {
        // Could not read either: still unknown.
      }
      return { status: "unconfirmed", kind: err.kind };
    }
    // A 403 without a code (the API user lacks the permission), a 404 without
    // one (the plugin is not installed), a stale link (patron_not_found), a
    // configuration or auth failure: the service is unavailable, not the loan.
    return { status: "unavailable", kind: err.kind, kohaErrorCode: err.kohaErrorCode };
  }
}
