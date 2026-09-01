/**
 * Who may create an account on a reserved administrative email domain.
 *
 * The rule exists because `@ptec.edu.kh` is the institution's own mail domain:
 * a stranger who self-registers `principal@ptec.edu.kh` on the public signup
 * page would be indistinguishable, by address alone, from library staff. So
 * self-service email/password signup on those domains is refused.
 *
 * **What the rule is NOT.** It is not a claim that the domain may not sign in.
 * A person who actually holds a `@ptec.edu.kh` mailbox proves it every time
 * they complete Google OAuth — Google verified the mailbox, which is strictly
 * stronger evidence than the confirmation email a self-service signup relies
 * on. Blocking them would mean the institution's own staff and partners at
 * `@moeys.gov.kh`, `@nie.edu.kh` and the rest are the only people who cannot
 * use the sign-in button, which is the opposite of the intent.
 *
 * This module is pure and client-safe on purpose: the signup form pre-checks
 * the domain in the browser to show a friendly message, the Server Action
 * re-checks it after the callback, and `supabase/migrations/
 * 0068_reserved_domain_signup_guard.sql` enforces it in the database where it
 * cannot be bypassed. Three enforcement points, one rule — stated here, and
 * pinned against the migration by `lib/auth/reserved-domains.test.ts`.
 */

/**
 * Domains that only the library may hand out.
 *
 * Kept in sync with the `reserved_domains` array in migration 0068 — the test
 * reads the migration and fails if the two lists drift.
 */
export const RESERVED_ADMIN_DOMAINS = [
  "@ptec.edu.kh",
  "@admin.ptec.edu.kh",
  "@ptec-admin.edu.kh",
] as const;

/** Does this address sit on a domain the library reserves for itself? */
export function isReservedAdminDomain(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return RESERVED_ADMIN_DOMAINS.some((domain) => normalized.endsWith(domain));
}

/**
 * The parts of a Supabase user this decision reads. Narrowed to a structural
 * type so the rule can be tested without constructing a whole `User`.
 */
export type SignupIdentity = {
  email?: string | null;
  /** GoTrue's `app_metadata`. */
  appMetadata?: {
    /** The account's originating provider: `"email"`, `"google"`, … */
    provider?: string | null;
    /** Every provider linked to the account. */
    providers?: string[] | null;
  } | null;
  /** Set by GoTrue when an administrator invited the account. */
  invitedAt?: string | null;
};

/**
 * Did this account come from an identity provider rather than a password form?
 *
 * Reads `providers` as well as `provider`, and that matters: when an existing
 * email/password account signs in with Google on a matching address, GoTrue
 * *links* the identity — it appends to `providers` and leaves `provider` at
 * `"email"`. Judging on `provider` alone would classify that Google sign-in as
 * a password signup, which for a `@ptec.edu.kh` address is precisely the
 * account this rule must never touch.
 */
export function isFederatedIdentity(identity: SignupIdentity): boolean {
  const provider = identity.appMetadata?.provider;
  if (provider && provider !== "email") return true;
  const providers = identity.appMetadata?.providers;
  return Array.isArray(providers) && providers.some((p) => p && p !== "email");
}

/** Why a signup was refused. Returned so the caller can log it, not shown to the user. */
export type SignupBlockReason = "reserved_admin_domain";

export type SignupDecision =
  | { allowed: true }
  | { allowed: false; reason: SignupBlockReason };

/**
 * The whole rule, in one place.
 *
 * Allowed, in the order the checks run:
 *  1. **Any federated sign-in.** Google — or any future provider — for every
 *     domain: `@gmail.com`, `@ptec.edu.kh`, `@moeys.gov.kh`, anything. This is
 *     also the clause that stops a *returning* user being re-judged: the
 *     callback this runs in fires on every OAuth sign-in, not only the first.
 *  2. **Invited accounts.** An administrator already vouched for the address.
 *  3. **Anything not on a reserved domain.** The ordinary case.
 *
 * Refused: a self-service email/password signup on a reserved domain — and
 * only that.
 */
export function decideSignup(identity: SignupIdentity): SignupDecision {
  if (isFederatedIdentity(identity)) return { allowed: true };
  if (identity.invitedAt) return { allowed: true };
  if (isReservedAdminDomain(identity.email)) {
    return { allowed: false, reason: "reserved_admin_domain" };
  }
  return { allowed: true };
}
