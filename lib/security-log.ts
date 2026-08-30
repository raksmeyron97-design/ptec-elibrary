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
  | "virus_scan_error" // the VirusTotal lookup itself failed (default fails open — logged; FAIL_CLOSED_VIRUS_SCAN=true rejects instead)
  | "virus_scan_skipped" // no VIRUSTOTAL_API_KEY configured — the upload was not scanned at all
  | "suspicious_input" // input rejected at a trust boundary
  | "rights_blocked" // full-text redistribution not authorized (citation-only record)
  | "download_blocked" // the library disabled downloads for this record (allow_download = false)
  | "csp_violation" // browser reported a Content-Security-Policy violation
  | "rate_limiter_degraded" // the DB rate limiter errored; emergency/open/closed fallback engaged
  | "lockdown_blocked" // a request was refused by an emergency lockdown switch
  | "security_spike"; // meta-event: the same event type fired unusually often (see below)

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

// ── Spike detection ──────────────────────────────────────────────────────────
// A burst of the same event type (credential stuffing → auth_forbidden spam,
// download scraping → rate_limited spam) otherwise appears as N unrelated
// lines. When one type crosses SPIKE_THRESHOLD within SPIKE_WINDOW_MS, emit a
// single escalated `security_spike` meta-event that the alert catalog can page
// on, then stay quiet for that type until its window rolls over.
//
// Per-process state: on serverless each instance counts separately, so a
// fleet-wide burst may under-trigger — this is a detection aid layered under
// log-aggregator alerting (docs/ALERT-CATALOG.md), not a replacement for it.
// `security_spike` itself is exempt from counting (no self-amplification).

const SPIKE_WINDOW_MS = 60_000;
const SPIKE_THRESHOLD = Math.max(
  5,
  Number.parseInt(process.env.SECURITY_SPIKE_THRESHOLD ?? "", 10) || 20,
);

type SpikeState = { windowStart: number; count: number; alerted: boolean };
const spikeCounters = new Map<SecurityEventType, SpikeState>();

/** Exported for tests only. */
export function _resetSpikeDetector(): void {
  spikeCounters.clear();
}

function trackSpike(type: SecurityEventType, where: string): void {
  if (type === "security_spike") return;
  const now = Date.now();
  let s = spikeCounters.get(type);
  if (!s || now - s.windowStart >= SPIKE_WINDOW_MS) {
    s = { windowStart: now, count: 0, alerted: false };
    spikeCounters.set(type, s);
  }
  s.count += 1;
  if (s.count >= SPIKE_THRESHOLD && !s.alerted) {
    s.alerted = true;
    emit({
      type: "security_spike",
      where,
      detail: `${type} fired ${s.count}x within ${SPIKE_WINDOW_MS / 1000}s (threshold ${SPIKE_THRESHOLD})`,
    });
  }
}

function emit(event: SecurityEvent): void {
  console.warn(
    JSON.stringify({
      evt: "security",
      ts: new Date().toISOString(),
      ...event,
    }),
  );
}

export function logSecurityEvent(event: SecurityEvent): void {
  try {
    emit(event);
    trackSpike(event.type, event.where);
  } catch {
    // Logging must never break the request path.
  }
}

