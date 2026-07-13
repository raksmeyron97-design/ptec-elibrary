/**
 * Structured security-event logging.
 *
 * Emits a single JSON line per event so log aggregators (Vercel Logs, Datadog,
 * Logtail, …) can filter on `evt:"security"` and alert on specific types.
 *
 * NEVER pass passwords, tokens, cookies, or user-generated content (notes,
 * messages) into `detail` — only identifiers and short technical context.
 */

export type SecurityEventType =
  | "auth_forbidden" // authenticated user lacked the required role/permission
  | "mfa_required" // admin-panel access attempted without AAL2
  | "rate_limited" // a rate limit fired
  | "captcha_failed" // Turnstile verification failed
  | "cron_auth_failed" // /api/cron/* called with a bad or missing secret
  | "upload_rejected" // file failed MIME/size/path validation
  | "virus_scan_blocked" // a file's hash matched known malware on VirusTotal
  | "virus_scan_error" // the VirusTotal lookup itself failed (fails open — logged, not blocking)
  | "suspicious_input" // input rejected at a trust boundary
  | "rights_blocked" // full-text redistribution not authorized (citation-only record)
  | "csp_violation"; // browser reported a Content-Security-Policy violation

export interface SecurityEvent {
  type: SecurityEventType;
  /** Route or Server Action where the event occurred, e.g. "/api/push/send". */
  where: string;
  /** Authenticated user id (internal UUID), if known. */
  userId?: string;
  /** Client IP, if known (only for unauthenticated surfaces). */
  ip?: string;
  /** Short technical context — no secrets, no user content. */
  detail?: string;
  /**
   * Correlation id — middleware sets `x-request-id` on every request
   * (reusing Cloudflare's cf-ray when present); read it via headers()
   * where cheap so log lines join up across a request.
   */
  requestId?: string;
}

export function logSecurityEvent(event: SecurityEvent): void {
  try {
    console.warn(
      JSON.stringify({
        evt: "security",
        ts: new Date().toISOString(),
        ...event,
      }),
    );
  } catch {
    // Logging must never break the request path.
  }
}
