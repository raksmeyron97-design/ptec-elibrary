/**
 * Telegram message formatting for security incidents.
 *
 * PURE. No network, no env, no secrets — everything the message needs is an
 * argument. That is what lets the privacy rules below be *tested* rather than
 * merely asserted in a comment.
 *
 * ── Why this file and not scripts/ops/alert-telegram.mjs ────────────────────
 * That script stays the transport for BOX and CI callers (backup jobs, GitHub
 * Actions): Node builtins only, reads credentials from a `.env` file on disk.
 * The production container has env vars but not the repo, so the app runtime
 * cannot use it. This module is the app-side formatter; `telegram.ts` beside
 * it is the app-side transport. They share the bot, the chat, the severity
 * tags and the timestamp format — `notify.parity.test.ts` reads the script's
 * source and fails if the two drift.
 *
 * ── The privacy contract (§27, catalog hygiene rule 6) ──────────────────────
 * A Telegram message may contain: severity, event type, risk, counts, service,
 * route shape, incident reference, request id, timestamps, and links.
 * It may NOT contain: credentials, tokens, cookies, email addresses, account
 * names, raw IPs, message bodies, or matched attack payloads. Everything that
 * could carry one of those has already been scrubbed by
 * `lib/security/model.ts`; `assertSafeForTelegram()` here is the last gate.
 */

import type { Severity } from "../model";

export const SEVERITY_TAGS: Record<Severity, string> = {
  1: "🚨 SEV 1",
  2: "⚠️ SEV 2",
  3: "🔔 SEV 3",
  4: "ℹ️ SEV 4",
};

export const SEVERITY_MEANING: Record<Severity, string> = {
  1: "Critical — act immediately, any hour",
  2: "High — same working day",
  3: "Medium — next working day",
  4: "Informational — weekly review",
};

/** Telegram's HTML parse mode needs exactly these three escaped. */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Phnom Penh wall clock beside UTC — responders think in local time, and
 * post-incident review happens in UTC. Cambodia has no DST, but `Intl` is used
 * rather than a fixed offset because this runs once per alert, not per event.
 */
export function timestamps(date: Date): string {
  const utc = `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
  return `${local} Phnom Penh · ${utc}`;
}

/** "8m 41s" — the shape the brief's recovery example uses. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Title case for an event type: "privilege_escalation" → "Privilege escalation". */
export function humanType(type: string): string {
  const words = type.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface IncidentMessageInput {
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
  /** Absolute base URL of the site, e.g. https://library.ptec.edu.kh. */
  baseUrl: string;
  /** Present only for a re-alert. */
  escalatedFrom?: Severity | null;
}

export interface RecoveryMessageInput {
  reference: string;
  severity: Severity;
  type: string;
  title: string;
  eventCount: number;
  firstSeen: Date;
  recoveredAt: Date;
  baseUrl: string;
}

function incidentUrl(baseUrl: string, reference: string): string {
  return `${baseUrl.replace(/\/$/, "")}/admin/security/incidents/${encodeURIComponent(reference)}`;
}

/** One "Label: value" line. Compact — Telegram is read on a phone (§40). */
function row(label: string, value: string): string {
  return `<b>${escapeHtml(label)}</b> ${escapeHtml(value)}`;
}

/**
 * The alert message.
 *
 * Deliberately says what the evidence supports and no more: "pattern
 * detected", "possible", "blocked" — never "attack prevented" or "hacker
 * detected" (§42). The `detectionReason` comes from the detector and already
 * carries the numbers that fired.
 */
export function buildIncidentMessage(input: IncidentMessageInput): string {
  const tag = SEVERITY_TAGS[input.severity];
  const heading = input.escalatedFrom
    ? `${tag} — SECURITY INCIDENT ESCALATED`
    : `${tag} — SECURITY INCIDENT`;

  const lines: string[] = [
    `${heading}`,
    `<b>${escapeHtml(input.title)}</b>`,
    "",
    row("Incident", input.reference),
    row("Type", humanType(input.type)),
    row("Service", input.service),
    row("Risk", `${input.riskScore}/100`),
    row("Events", String(input.eventCount)),
    row("Status", input.status.toUpperCase()),
  ];

  if (input.escalatedFrom) {
    lines.push(row("Escalated", `Sev ${input.escalatedFrom} → Sev ${input.severity}`));
  }

  lines.push(
    row("Detected", timestamps(input.firstSeen)),
    "",
    `<i>${escapeHtml(input.detectionReason)}</i>`,
    "",
    row("Response", SEVERITY_MEANING[input.severity]),
    `🔗 <a href="${escapeHtml(incidentUrl(input.baseUrl, input.reference))}">Open incident</a>`,
  );

  if (input.runbook) lines.push(`📕 Runbook: <code>${escapeHtml(input.runbook)}</code>`);

  return lines.join("\n");
}

/**
 * The recovery message. Sent at most once per incident.
 *
 * "No further events" is the honest claim: the detectors observe attacks, not
 * attackers, so quiet is evidence that it stopped — not evidence that we
 * stopped it.
 */
export function buildRecoveryMessage(input: RecoveryMessageInput): string {
  const duration = formatDuration(input.recoveredAt.getTime() - input.firstSeen.getTime());
  return [
    "✅ SECURITY INCIDENT RECOVERED",
    `<b>${escapeHtml(input.title)}</b>`,
    "",
    row("Incident", input.reference),
    row("Type", humanType(input.type)),
    row("Duration", duration),
    row("Events", String(input.eventCount)),
    row("Recovered", timestamps(input.recoveredAt)),
    "",
    "<i>No further events within the quiet period. The incident stopped producing evidence — this is not a claim that it was blocked or remediated.</i>",
    `🔗 <a href="${escapeHtml(incidentUrl(input.baseUrl, input.reference))}">Open incident</a>`,
  ].join("\n");
}

/**
 * The alert-pipeline meta-alert (§41): security events are being recorded, but
 * nobody is being told. Sent through the same channel that is failing, on the
 * chance that it has recovered — and recorded either way.
 */
export function buildPipelineDegradedMessage(input: {
  eventsAffected: number;
  deliveryFailures: number;
  fallback: string;
  baseUrl: string;
}): string {
  return [
    `${SEVERITY_TAGS[2]} — ALERT PIPELINE DEGRADED`,
    "<b>Security alerts are not being delivered</b>",
    "",
    row("Incidents affected", String(input.eventsAffected)),
    row("Delivery failures", String(input.deliveryFailures)),
    row("Fallback", input.fallback),
    "",
    "<i>Detection and recording are working; only the notification channel is failing. Check the incident list directly.</i>",
    `🔗 <a href="${escapeHtml(`${input.baseUrl.replace(/\/$/, "")}/admin/security`)}">Open security console</a>`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// The last gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patterns that must never appear in an outbound message. This is a backstop,
 * not the primary control — `sanitizeText`/`sanitizeMetadata` in
 * `lib/security/model.ts` already scrubbed everything on the way in. It exists
 * because a single careless template literal in a future detector is all it
 * would take, and a leak into a chat group is not recoverable.
 */
const FORBIDDEN: { re: RegExp; label: string }[] = [
  { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, label: "a JWT" },
  { re: /\bsb[ps]?_[A-Za-z0-9_-]{20,}/, label: "a Supabase key" },
  { re: /\bAIza[0-9A-Za-z_-]{20,}/, label: "a Google API key" },
  { re: /\bghp_[A-Za-z0-9]{20,}/, label: "a GitHub token" },
  { re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}/, label: "a Telegram bot token" },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, label: "an email address" },
  { re: /\b(?:password|passwd|secret|api[_-]?key|bearer)\s*[:=]\s*\S/i, label: "a labelled credential" },
  // A public IPv4. Private/loopback addresses are allowed: they appear in
  // SSRF signature names and carry no personal information.
  { re: /\b(?!10\.|127\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, label: "a raw IP address" },
  { re: /<\s*script|javascript:|\bUNION\s+SELECT\b/i, label: "an attack payload" },
];

export interface SafetyVerdict {
  safe: boolean;
  violation?: string;
}

/** Check a composed message against the privacy contract. */
export function checkSafeForTelegram(message: string): SafetyVerdict {
  for (const { re, label } of FORBIDDEN) {
    if (re.test(message)) return { safe: false, violation: label };
  }
  return { safe: true };
}

/**
 * Redact rather than refuse. An alert that cannot be sent is worse than an
 * alert with a redacted field: the operator still needs to know an incident
 * opened. The violation is reported to the caller so it can be logged as a
 * bug in whichever detector produced it.
 */
export function redactForTelegram(message: string): { text: string; redacted: string[] } {
  const redacted: string[] = [];
  let text = message;
  for (const { re, label } of FORBIDDEN) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    if (global.test(text)) {
      redacted.push(label);
      text = text.replace(new RegExp(re.source, `${re.flags.replace("g", "")}g`), "[redacted]");
    }
  }
  return { text, redacted };
}

/** Telegram rejects messages over 4096 characters. */
export const TELEGRAM_MAX_LENGTH = 4096;

export function clampToTelegramLimit(message: string): string {
  if (message.length <= TELEGRAM_MAX_LENGTH) return message;
  return `${message.slice(0, TELEGRAM_MAX_LENGTH - 20)}\n…(truncated)`;
}
