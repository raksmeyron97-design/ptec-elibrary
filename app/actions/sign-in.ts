"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * Server-side password sign-in.
 *
 * ── Why this exists (decision D1, docs/SECURITY_MONITORING_AUDIT.md §3.1) ───
 * Sign-in used to run entirely in the browser: `LoginContent.tsx` and the
 * admin login page each called `supabase.auth.signInWithPassword` directly
 * against GoTrue. The Next.js server was never in the path, so it could not
 * count, rate-limit, or record a failed attempt — and GoTrue's own audit table
 * does not help: a probe of the live stack showed three wrong-password POSTs
 * leaving `auth.audit_log_entries` unchanged at 146 rows, because GoTrue emits
 * no `login_failed` action at all.
 *
 * The consequence was that `brute_force`, `credential_stuffing` and
 * `mfa_failure_spike` had NO observable signal in this deployment, and the
 * login form had no rate limit of its own (only Turnstile). Routing sign-in
 * through the server is the only thing that changes that.
 *
 * ── What did NOT change ─────────────────────────────────────────────────────
 * Google OAuth stays client-side: it is a top-level redirect to Google and
 * back through `/auth/callback`, so there is no password to guess and nothing
 * for a proxy to observe that the callback does not already see.
 *
 * Session cookies are written by the same `@supabase/ssr` server client the
 * rest of the app uses, with the shared `AUTH_COOKIE_OPTIONS`, so the browser
 * client picks the session up from the same cookie names with no extra step
 * (see lib/supabase/cookie-options.ts).
 *
 * ── Account enumeration ─────────────────────────────────────────────────────
 * Every failure returns ONE generic message. The caller must not add branches
 * that distinguish "no such account" from "wrong password" from "not
 * confirmed" — the admin login page already made that choice deliberately, and
 * this makes it the rule for both surfaces.
 */

export type SignInSurface = "public" | "admin";

export interface SignInResult {
  ok: boolean;
  /** A rendered message. Callers may use `code` to localise instead. */
  error?: string;
  /**
   * Classified failure reason, so each surface keeps the wording it already
   * had (the public form localises through next-intl; the admin form collapses
   * everything to one line on purpose).
   *
   * NOTE — this preserves TODAY's behaviour rather than changing it. The
   * public form currently distinguishes "email not confirmed" from "invalid
   * credentials", which does confirm that an address has an account. That is a
   * pre-existing exposure, unchanged here because silently altering a
   * user-facing security policy is not this change's job; it is recorded as a
   * recommendation in docs/SECURITY_MONITORING_AUDIT.md instead.
   */
  code?: SignInErrorCode;
}

export type SignInErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "captcha_rejected"
  | "provider_rate_limited"
  | "account_disabled"
  | "provider_unreachable"
  | "rate_limited"
  | "other";

const GENERIC_ERROR = "Email or password is incorrect. Please try again.";
const RATE_LIMITED_ERROR =
  "Too many sign-in attempts. Please wait a few minutes and try again.";

/**
 * A stable, non-reversible label for an account that does not exist.
 *
 * Brute-force detection needs to group attempts by the account they targeted,
 * but storing the address would put an email in the security log — which the
 * log contract forbids, and which would then reach dashboards and CSV exports.
 * A keyed hash groups correctly and reveals nothing. Real accounts are labelled
 * with their profile UUID instead, which an operator can resolve and an alert
 * never shows.
 */
function unknownAccountLabel(email: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!secret) return "unknown";
  const digest = createHmac("sha256", secret).update(email).digest("hex").slice(0, 12);
  return `unknown:${digest}`;
}

/** Resolve the account being attacked to an internal id, without leaking it. */
async function accountLabel(email: string): Promise<string> {
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    return data?.id ?? unknownAccountLabel(email);
  } catch {
    return unknownAccountLabel(email);
  }
}

export async function signInWithPassword(input: {
  email: string;
  password: string;
  captchaToken?: string;
  surface?: SignInSurface;
}): Promise<SignInResult> {
  const surface: SignInSurface = input.surface === "admin" ? "admin" : "public";
  const where = surface === "admin" ? "/admin/login" : "/auth/login";
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) return { ok: false, error: GENERIC_ERROR, code: "invalid_credentials" };

  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const requestId = requestHeaders.get("x-request-id") ?? undefined;

  // Two limits, because they stop different attacks: per-client stops one
  // machine hammering many accounts (credential stuffing), per-account stops
  // many machines hammering one account (distributed brute force).
  //
  // failMode "emergency" (the default) enforces the same limit from process
  // memory if the database check errors. "closed" was considered and rejected:
  // a Postgres blip would lock every reader out of the library, and the
  // password itself is still checked by GoTrue.
  const perClient = ratePolicy("login");
  const perAccount = ratePolicy("loginAccount");
  const [clientOk, accountOk] = await Promise.all([
    rateLimit(`login:ip:${ip}`, perClient.limit, perClient.windowMs),
    rateLimit(`login:acct:${unknownAccountLabel(email)}`, perAccount.limit, perAccount.windowMs),
  ]);

  if (!clientOk.success || !accountOk.success) {
    logSecurityEvent({
      type: "rate_limited",
      where,
      ip,
      requestId,
      detail: clientOk.success ? "per-account sign-in limit" : "per-client sign-in limit",
      metadata: { surface, scope: clientOk.success ? "account" : "client" },
    });
    return { ok: false, error: RATE_LIMITED_ERROR, code: "rate_limited" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: input.captchaToken ? { captchaToken: input.captchaToken } : undefined,
  });

  if (error) {
    const reason = classifyAuthError(error.message);
    // The signal that did not exist before this action.
    logSecurityEvent({
      type: "login_failed",
      where,
      ip,
      requestId,
      target: await accountLabel(email),
      // Reason CLASS only. The provider's message can echo the submitted
      // address back, and this string is persisted.
      detail: reason,
      metadata: { surface, reason },
    });
    return { ok: false, error: GENERIC_ERROR, code: reason };
  }

  const userId = data.user?.id;
  logSecurityEvent({
    type: "login_succeeded",
    where,
    ip,
    requestId,
    userId,
    target: userId,
    metadata: { surface },
  });

  return { ok: true };
}

/**
 * Collapse GoTrue's message into a small, safe vocabulary.
 *
 * Stored and shown to admins; never shown to the person signing in, who always
 * gets GENERIC_ERROR. Distinguishing these in the DETECTOR is useful — a burst
 * of `invalid_credentials` is an attack, a burst of `email_not_confirmed` is a
 * broken signup email — but distinguishing them in the RESPONSE would confirm
 * which addresses have accounts.
 */
function classifyAuthError(message: string): SignInErrorCode {
  const m = message.toLowerCase();
  if (/invalid login|invalid credentials/.test(m)) return "invalid_credentials";
  if (/email not confirmed/.test(m)) return "email_not_confirmed";
  if (/captcha/.test(m)) return "captcha_rejected";
  if (/too many requests|rate limit/.test(m)) return "provider_rate_limited";
  if (/banned|disabled/.test(m)) return "account_disabled";
  if (/network|fetch/.test(m)) return "provider_unreachable";
  return "other";
}

/**
 * Server-side second-factor verification, for the same reason as sign-in:
 * `auth.audit_log_entries` records `verification_attempted` with no outcome
 * field, so a rejected TOTP is indistinguishable from an accepted one there
 * (audit §3.2). Without this, `mfa_failure_spike` could not exist.
 */
export async function verifyMfa(input: {
  factorId: string;
  code: string;
}): Promise<SignInResult> {
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const requestId = requestHeaders.get("x-request-id") ?? undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const limit = ratePolicy("mfaVerify");
  const key = user?.id ? `mfa:user:${user.id}` : `mfa:ip:${ip}`;
  const allowed = await rateLimit(key, limit.limit, limit.windowMs);
  if (!allowed.success) {
    logSecurityEvent({
      type: "rate_limited",
      where: "/admin/mfa/verify",
      ip,
      requestId,
      userId: user?.id,
      detail: "second-factor verification limit",
    });
    return { ok: false, error: RATE_LIMITED_ERROR, code: "rate_limited" };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: input.factorId,
    code: input.code,
  });

  if (error) {
    logSecurityEvent({
      type: "mfa_failed",
      where: "/admin/mfa/verify",
      ip,
      requestId,
      userId: user?.id,
      target: user?.id,
      detail: "totp_rejected",
    });
    return { ok: false, error: "That code is not valid. Please try again." };
  }

  return { ok: true };
}
