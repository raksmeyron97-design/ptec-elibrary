import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/seo/site";
import { logSecurityEvent } from "@/lib/security-log";
import { alertMaxAttempts } from "../config";
import {
  buildIncidentMessage,
  buildPipelineDegradedMessage,
  buildRecoveryMessage,
  checkSafeForTelegram,
  clampToTelegramLimit,
  redactForTelegram,
} from "./format";
import type { Severity } from "../model";

/**
 * App-side Telegram transport for security incidents.
 *
 * ── Not a second alert system ───────────────────────────────────────────────
 * Same bot, same chat, same severity vocabulary as
 * `scripts/ops/alert-telegram.mjs` (pinned by `format.test.ts`). The CLI stays
 * the sender for box jobs and GitHub Actions, which cannot import TypeScript
 * and read credentials from a `.env` file on disk. The production container has
 * env vars but not the repo, so the app needs this one. Formatting and policy
 * are shared; only the credential path differs.
 *
 * ── Failure posture (§30) ───────────────────────────────────────────────────
 * A broken Telegram must never damage the application, and must never make an
 * incident disappear:
 *   • the incident is already persisted before this is called;
 *   • every attempt is recorded in `alert_deliveries`, success or not;
 *   • a permanent failure emits `alert_delivery_failed`, which the detection
 *     pass promotes to an `alert_pipeline_degraded` incident (§41);
 *   • nothing here throws, and nothing here is awaited by a user request.
 */

const TELEGRAM_TIMEOUT_MS = 15_000;

export type DeliveryKind = "alert" | "recovery" | "escalation" | "digest" | "test";
export type DeliveryStatus = "sent" | "failed" | "suppressed" | "skipped";

export interface DeliveryResult {
  status: DeliveryStatus;
  attempts: number;
  errorClass?: string;
  latencyMs?: number;
  /** Set when the privacy gate had to remove something — a detector bug. */
  redacted?: string[];
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Classify a failure into a short, non-sensitive label. Telegram's response
 * body can echo the message back, so it is never stored — only the class.
 */
function classifyError(status: number | null, error?: unknown): string {
  if (status === 401 || status === 403) return "auth_rejected";
  if (status === 400) return "bad_request";
  if (status === 429) return "rate_limited";
  if (status && status >= 500) return `upstream_${status}`;
  if (status) return `http_${status}`;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/abort|timeout/i.test(message)) return "timeout";
  if (/fetch|network|ENOTFOUND|ECONNREFUSED/i.test(message)) return "unreachable";
  return "unknown";
}

/** Retry only what retrying can fix. A 400 will be a 400 forever. */
function isRetryable(errorClass: string): boolean {
  return (
    errorClass === "timeout" ||
    errorClass === "unreachable" ||
    errorClass === "rate_limited" ||
    errorClass.startsWith("upstream_")
  );
}

async function postToTelegram(
  token: string,
  chatId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; errorClass: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    // Body deliberately not read into any stored field.
    return { ok: false, errorClass: classifyError(res.status) };
  } catch (e) {
    return { ok: false, errorClass: classifyError(null, e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Record one delivery attempt. Best-effort: a missing table must not throw. */
async function recordDelivery(
  incidentId: string | null,
  kind: DeliveryKind,
  result: DeliveryResult,
): Promise<void> {
  const db = serviceClient();
  if (!db) return;
  try {
    const { error } = await db.from("alert_deliveries").insert({
      incident_id: incidentId,
      channel: "telegram",
      kind,
      status: result.status,
      attempt: result.attempts,
      error_class: result.errorClass ?? null,
      latency_ms: result.latencyMs ?? null,
    });
    if (error && !["42P01", "PGRST205"].includes(error.code ?? "")) {
      console.error("[security-notify] delivery record failed:", error.message);
    }
  } catch (e) {
    console.error("[security-notify] delivery record failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Send one message, with the privacy gate, bounded retries, and a durable
 * record of what happened. Never throws.
 */
export async function sendSecurityMessage(
  message: string,
  opts: { incidentId?: string | null; kind: DeliveryKind; reference?: string },
): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // The last privacy gate before anything leaves the building. Redact rather
  // than refuse: an operator who is not told an incident opened is worse off
  // than one told with a field blanked out. The violation is logged loudly
  // because it means a detector is composing something it should not.
  const verdict = checkSafeForTelegram(message);
  let text = message;
  let redacted: string[] | undefined;
  if (!verdict.safe) {
    const result = redactForTelegram(message);
    text = result.text;
    redacted = result.redacted;
    console.error(
      `[security-notify] BUG: an outbound alert contained ${verdict.violation}; it was redacted before sending. Fix the detector that composed it.`,
    );
  }
  text = clampToTelegramLimit(text);

  if (!token || !chatId) {
    const result: DeliveryResult = { status: "skipped", attempts: 0, errorClass: "no_credentials", redacted };
    await recordDelivery(opts.incidentId ?? null, opts.kind, result);
    console.warn(
      `[security-notify] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — ${opts.kind} for ${opts.reference ?? "incident"} NOT delivered.`,
    );
    return result;
  }

  const maxAttempts = alertMaxAttempts();
  const startedAt = Date.now();
  let lastErrorClass = "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = await postToTelegram(token, chatId, text);
    if (outcome.ok) {
      const result: DeliveryResult = {
        status: "sent",
        attempts: attempt,
        latencyMs: Date.now() - startedAt,
        redacted,
      };
      await recordDelivery(opts.incidentId ?? null, opts.kind, result);
      return result;
    }
    lastErrorClass = outcome.errorClass;
    if (!isRetryable(outcome.errorClass) || attempt === maxAttempts) break;
    // Linear backoff; Telegram's 429 window is short and this is not a
    // high-volume channel.
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }

  const result: DeliveryResult = {
    status: "failed",
    attempts: maxAttempts,
    errorClass: lastErrorClass,
    latencyMs: Date.now() - startedAt,
    redacted,
  };
  await recordDelivery(opts.incidentId ?? null, opts.kind, result);

  // Make the failure itself a security event. It is Sev 3, which is below the
  // notification threshold, so this cannot recurse into another send — the
  // detection pass promotes a RUN of these into one pipeline-degraded incident.
  logSecurityEvent({
    type: "alert_delivery_failed",
    where: "lib/security/notify/telegram",
    detail: `${opts.kind} delivery failed after ${maxAttempts} attempts (${lastErrorClass})`,
    metadata: { kind: opts.kind, errorClass: lastErrorClass, attempts: maxAttempts },
  });
  console.error(
    `[security-notify] ${opts.kind} for ${opts.reference ?? "incident"} NOT delivered after ${maxAttempts} attempts (${lastErrorClass}). The incident is recorded; check /admin/security.`,
  );
  return result;
}

// ── Typed entry points ──────────────────────────────────────────────────────

export interface IncidentNotification {
  id: string;
  reference: string;
  severity: Severity;
  type: string;
  title: string;
  category: string;
  service: string;
  riskScore: number;
  status: string;
  eventCount: number;
  firstSeen: Date;
  lastSeen: Date;
  detectionReason: string;
  runbook?: string | null;
  escalatedFrom?: Severity | null;
}

export function notifyIncident(incident: IncidentNotification): Promise<DeliveryResult> {
  return sendSecurityMessage(buildIncidentMessage({ ...incident, baseUrl: SITE_URL }), {
    incidentId: incident.id,
    kind: incident.escalatedFrom ? "escalation" : "alert",
    reference: incident.reference,
  });
}

export function notifyRecovery(incident: {
  id: string;
  reference: string;
  severity: Severity;
  type: string;
  title: string;
  eventCount: number;
  firstSeen: Date;
  recoveredAt: Date;
}): Promise<DeliveryResult> {
  return sendSecurityMessage(buildRecoveryMessage({ ...incident, baseUrl: SITE_URL }), {
    incidentId: incident.id,
    kind: "recovery",
    reference: incident.reference,
  });
}

export function notifyPipelineDegraded(input: {
  eventsAffected: number;
  deliveryFailures: number;
  fallback: string;
}): Promise<DeliveryResult> {
  return sendSecurityMessage(buildPipelineDegradedMessage({ ...input, baseUrl: SITE_URL }), {
    kind: "alert",
    reference: "alert-pipeline",
  });
}
