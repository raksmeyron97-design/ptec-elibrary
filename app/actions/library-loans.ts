"use server";
// A reader renews one of their own library loans (Koha Phase 10.1), and
// places or cancels their own holds (10.2) — docs/KOHA-READER-SERVICES.md.
// The only inputs are Koha's loan or hold number, or a catalogue slug; the
// reader comes from the verified session and the Koha patron from THEIR link,
// and lib/koha/reader-services.ts refuses a number that is not in the
// reader's own loans or holds before anything is sent to Koha.

import { getSessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { kohaHoldsForReaders, kohaRenewsForReaders } from "@/lib/koha/patron-server";
import { cancelHoldForReader, placeHoldForReader, renewForReader } from "@/lib/koha/reader-services";
import type { HoldResult, RenewResult } from "@/lib/dashboard/library-loans";

export async function renewLibraryLoan(checkoutId: number): Promise<RenewResult> {
  if (!Number.isSafeInteger(checkoutId) || checkoutId <= 0) return { status: "not_found" };
  if (!kohaRenewsForReaders()) return { status: "off" };
  const user = await getSessionUser();
  if (!user) return { status: "not_found" };

  const { limit, windowMs } = ratePolicy("kohaRenew");
  if (!(await rateLimit(`koha-renew:${user.id}`, limit, windowMs)).success) {
    logSecurityEvent({ type: "rate_limited", where: "renewLibraryLoan", userId: user.id });
    return { status: "rate_limited" };
  }
  return renewForReader(user.id, checkoutId);
}

/** The signed-in reader, within their hold budget (placing and cancelling share it); or why not. */
async function holdingReader(where: string): Promise<{ id: string } | HoldResult> {
  if (!kohaHoldsForReaders()) return { status: "off" };
  const user = await getSessionUser();
  if (!user) return { status: "not_found" };
  const { limit, windowMs } = ratePolicy("kohaHold");
  if (!(await rateLimit(`koha-hold:${user.id}`, limit, windowMs)).success) {
    logSecurityEvent({ type: "rate_limited", where, userId: user.id });
    return { status: "rate_limited" };
  }
  return { id: user.id };
}

const SLUG_MAX = 300;

export async function placeLibraryHold(slug: string): Promise<HoldResult> {
  if (typeof slug !== "string" || !slug.trim() || slug.length > SLUG_MAX) return { status: "not_found" };
  const reader = await holdingReader("placeLibraryHold");
  return "id" in reader ? placeHoldForReader(reader.id, slug.trim()) : reader;
}

export async function cancelLibraryHold(holdId: number): Promise<HoldResult> {
  if (!Number.isSafeInteger(holdId) || holdId <= 0) return { status: "not_found" };
  const reader = await holdingReader("cancelLibraryHold");
  return "id" in reader ? cancelHoldForReader(reader.id, holdId) : reader;
}
