/**
 * Structured security-event logging — the emitter every call site uses.
 *
 * Emits a single JSON line per event so log aggregators (Vercel Logs, Datadog,
 * Logtail, `docker logs` + Loki) can filter on `evt:"security"`, AND hands the
 * event to the registered sink so it becomes a durable row the detection
 * engine can query. Before the sink existed, every event here was a console
 * line that the container's log driver eventually rotated away — which meant
 * the whole Security section of docs/ALERT-CATALOG.md described thresholds
 * against data nobody kept (docs/SECURITY_MONITORING_AUDIT.md §1).
 *
 * NEVER pass passwords, tokens, cookies, or user-generated content (notes,
 * messages) into `detail` — only identifiers and short technical context.
 * `lib/security/model.ts` scrubs and truncates as a backstop, not a licence.
 *
 * The TAXONOMY lives in `lib/security/model.ts` (pure, shared with the
 * detection engine, the dashboard and the tests) and is re-exported here so
 * existing imports keep working.
 */

import {
  normalizeEvent,
  type ActorType,
  type EventResult,
  type NormalizedSecurityEvent,
  type SecurityEventInput,
  type SecurityEventType,
} from "@/lib/security/model";

export type { SecurityEventType, NormalizedSecurityEvent };

/** The call-site shape. Unchanged from before the pipeline existed. */
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
  /** What the request was aimed at (a role name, a service, a resource id). */
  target?: string;
  /** Who acted. Inferred from `userId` when omitted; pass "admin" explicitly
   *  where the actor's privilege is itself part of what makes the event
   *  notable (a role grant, a settings change). */
  actorType?: ActorType;
  /** What happened to the request. Inferred from the type when omitted. */
  result?: EventResult;
  /** Structured, non-sensitive context — sanitized before it is persisted. */
  metadata?: Record<string, unknown>;
  /** How many raw occurrences this stands for (derived/aggregated events). */
  count?: number;
}

// ── Durable sink ─────────────────────────────────────────────────────────────
//
// Registered at server startup by `instrumentation.ts`, which is the only
// place that may import the server-only persistence module. Keeping the wiring
// inverted is what lets THIS file stay free of `server-only`, so the pure unit
// tests and the middleware-adjacent code paths can still import it.
//
// The sink is fire-and-forget by contract: it must never throw, never reject
// in a way that reaches the request, and never block the response.

export type SecuritySink = (event: NormalizedSecurityEvent) => void;

let sink: SecuritySink | null = null;

/** Install the durable sink. Passing null removes it (used by tests). */
export function registerSecuritySink(next: SecuritySink | null): void {
  sink = next;
}

/** Exported for tests only. */
export function _getSecuritySink(): SecuritySink | null {
  return sink;
}

// ── Spike detection ──────────────────────────────────────────────────────────
// A burst of the same event type (credential stuffing → auth_forbidden spam,
// download scraping → rate_limited spam) otherwise appears as N unrelated
// lines. When one type crosses SPIKE_THRESHOLD within SPIKE_WINDOW_MS, emit a
// single escalated `security_spike` meta-event that the alert catalog can page
// on, then stay quiet for that type until its window rolls over.
//
// This remains the FIRST stage of detection, not the whole of it: it is
// per-process and resets on container restart. The durable second stage lives
// in `lib/security/detect/*`, which queries persisted rows and so survives
// restarts and sees across instances. Keeping the cheap in-process filter is
// deliberate — it catches a burst within the same second, before any
// out-of-band pass would run.
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
    logSecurityEvent({
      type: "security_spike",
      where,
      detail: `${type} fired ${s.count}x within ${SPIKE_WINDOW_MS / 1000}s (threshold ${SPIKE_THRESHOLD})`,
      count: s.count,
      metadata: { spikeType: type, windowSeconds: SPIKE_WINDOW_MS / 1000 },
    });
  }
}

function emit(event: NormalizedSecurityEvent): void {
  // One line, same `evt:"security"` contract as before, now carrying the
  // severity/risk/fingerprint the detection engine reasons about — so a grep
  // over stdout and a query over the table give the same answer.
  console.warn(
    JSON.stringify({
      evt: "security",
      ts: event.timestamp,
      type: event.type,
      severity: event.severity,
      risk: event.riskScore,
      fingerprint: event.fingerprint,
      service: event.service,
      where: event.where,
      result: event.result,
      actorType: event.actorType,
      ...(event.actorId ? { userId: event.actorId } : {}),
      ...(event.target ? { target: event.target } : {}),
      ...(event.detail ? { detail: event.detail } : {}),
      ...(event.requestId ? { requestId: event.requestId } : {}),
      ...(event.count > 1 ? { count: event.count } : {}),
    }),
  );
}

/**
 * Record a security event. Synchronous, total, and safe to call from a
 * `catch` block or a hot request path: normalization is arithmetic, the log
 * line is one `console.warn`, and persistence is deferred by the sink.
 */
export function logSecurityEvent(event: SecurityEvent): void {
  try {
    const normalized = normalizeEvent(event as SecurityEventInput);
    emit(normalized);
    try {
      sink?.(normalized);
    } catch {
      // A failing sink must never break the request, and must never prevent
      // the console line — which is the fallback record when the DB is the
      // thing that is broken.
    }
    trackSpike(event.type, event.where);
  } catch {
    // Logging must never break the request path.
  }
}
