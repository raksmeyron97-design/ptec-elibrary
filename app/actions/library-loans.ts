"use server";
// A reader renews one of their own library loans (Koha Phase 10.1,
// docs/KOHA-READER-SERVICES.md). The only input is Koha's loan number; the
// reader comes from the verified session and the Koha patron from THEIR link,
// and lib/koha/reader-services.ts refuses a number that is not in the
// reader's own loans before anything is sent to Koha.

import { getSessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { kohaRenewsForReaders } from "@/lib/koha/patron-server";
import { renewForReader } from "@/lib/koha/reader-services";
import type { RenewResult } from "@/lib/dashboard/library-loans";

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
