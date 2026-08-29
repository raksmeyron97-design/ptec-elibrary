import "server-only";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * Emergency lockdown switches — feature-level kill switches for active
 * incidents, one step above the rate-limit tuning switches in
 * `lib/rate-limit-policy.ts` (which throttle; these stop).
 *
 * Threat model: an incident is in progress (AI cost abuse, storage
 * exfiltration, a suspected compromised admin account) and the operator needs
 * to contain it in minutes without shipping code. Controls are environment
 * variables, so only someone with deployment/host access can flip them —
 * ordinary users and admins cannot.
 *
 *   LOCKDOWN_AI=true               — refuse /api/ai, /api/ask, /api/chat
 *   LOCKDOWN_DOWNLOADS=true        — refuse book/thesis/publication file +
 *                                    download routes (covers crawler access too)
 *   LOCKDOWN_ADMIN_MUTATIONS=true  — every admin guard fails for panel roles
 *                                    below super_admin; super admins stay in so
 *                                    the operator can act during the incident
 *   LOCKDOWN_ALL=true              — all of the above
 *
 * Failure mode: fail closed while flipped on; unset/any other value = off
 * (normal operation). Each refusal emits a `lockdown_blocked` security event.
 * Runbook: docs/SECURITY_DEFENSE_IN_DEPTH.md → "Emergency lockdown".
 */

export type LockdownFeature = "ai" | "downloads" | "admin_mutations";

const ENV_FOR_FEATURE: Record<LockdownFeature, string> = {
  ai: "LOCKDOWN_AI",
  downloads: "LOCKDOWN_DOWNLOADS",
  admin_mutations: "LOCKDOWN_ADMIN_MUTATIONS",
};

export function isLockedDown(feature: LockdownFeature): boolean {
  if (process.env.LOCKDOWN_ALL === "true") return true;
  return process.env[ENV_FOR_FEATURE[feature]] === "true";
}

/**
 * Standard refusal for a locked-down route handler: logs the event and returns
 * a 503 with Retry-After so well-behaved clients back off. Returns null when
 * the feature is available, so handlers can gate in one line:
 *
 *   const locked = lockdownResponse("downloads", "/api/books/[slug]/file");
 *   if (locked) return locked;
 */
export function lockdownResponse(
  feature: LockdownFeature,
  where: string,
  meta?: { userId?: string; ip?: string },
): Response | null {
  if (!isLockedDown(feature)) return null;
  logSecurityEvent({ type: "lockdown_blocked", where, detail: feature, ...meta });
  return new Response(
    JSON.stringify({ error: "This feature is temporarily unavailable." }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "600",
        "Cache-Control": "private, no-store",
      },
    },
  );
}
