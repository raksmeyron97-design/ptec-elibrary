import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { anonymousSessionHash } from "@/lib/search/analytics";
import type { NormalizedSecurityEvent } from "@/lib/security/model";

/**
 * Durable sink for security events — the piece that turns a console line into
 * something a detector can count.
 *
 * ── Design constraints (§29 of the brief) ───────────────────────────────────
 * Security monitoring must not damage request latency. This sink therefore
 * does NO work on the hot path beyond an array push: events are buffered in
 * memory and written in batches, so a request that trips a rate limit pays a
 * pointer write, not a round trip to Postgres.
 *
 * Why a buffer + timer rather than Next's `after()`: `logSecurityEvent` is
 * called from Server Actions, route handlers, middleware-adjacent helpers AND
 * from background work (cron sweeps, the detection pass). `after()` is only
 * valid inside a request/render scope, so routing every event through it would
 * either throw or silently drop exactly the events raised by background jobs.
 * A process-level buffer is scope-independent and batches better.
 *
 * ── Failure posture ─────────────────────────────────────────────────────────
 * Every failure mode degrades to "the console line is still the record":
 *   • DB unreachable        → batch dropped after bounded retries, counted
 *   • table missing (0127)  → sink disables itself, one warning, no spam
 *   • buffer overflow       → oldest events dropped, drop count reported
 * The sink NEVER throws into a caller and never awaits on the request path.
 */

// ── Tunables ────────────────────────────────────────────────────────────────
// Deliberately modest: PTEC's event volume is hundreds per day in normal
// operation and thousands per hour under attack — which is exactly when
// batching matters most and when memory must stay bounded.

const BATCH_SIZE = 25;
const FLUSH_INTERVAL_MS = 2_000;
/** Above this, the oldest buffered events are dropped rather than grow memory. */
const MAX_BUFFER = 1_000;
/** A batch that fails this many times is abandoned; the console line remains. */
const MAX_ATTEMPTS = 3;
/** Severity at or below this flushes immediately instead of waiting. */
const URGENT_SEVERITY = 2;

type Row = {
  event_type: string;
  severity: number;
  risk_score: number;
  risk_reason: string | null;
  service: string;
  location: string;
  actor_type: string;
  actor_id: string | null;
  target: string | null;
  result: string;
  detail: string | null;
  request_id: string | null;
  ip_hash: string | null;
  event_count: number;
  fingerprint: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

let buffer: Row[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
/**
 * The in-flight flush, or null. Held (rather than a bare boolean) so a caller
 * that awaits `flush()` while one is already running actually waits for it —
 * otherwise a shutdown drain returns before the last batch has been written,
 * which is the difference between "events persisted" and "events lost".
 */
let inFlight: Promise<void> | null = null;
let disabled = false;
let droppedSinceReport = 0;
let client: SupabaseClient | null = null;

/** Cheap UUID shape check — actor_id is a uuid column and a bad value 400s. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/**
 * Daily-rotating keyed hash of the client IP — the same scheme 0087/0090/0094
 * already use, so the privacy contract is one contract. A visitor's events
 * group within a day and cannot be correlated across days; no raw address is
 * ever written. Returns null when no secret is configured, in which case the
 * event is stored without any client correlation rather than with something
 * reversible.
 */
export function hashIp(ip: string | undefined, now: Date = new Date()): string | null {
  if (!ip || ip === "unknown") return null;
  return anonymousSessionHash(ip, "", process.env.SUPABASE_SERVICE_ROLE_KEY, now);
}

export function toRow(event: NormalizedSecurityEvent): Row {
  return {
    event_type: event.type,
    severity: event.severity,
    risk_score: event.riskScore,
    risk_reason: event.riskReason ?? null,
    service: event.service,
    location: event.where.slice(0, 200),
    actor_type: event.actorType,
    actor_id: event.actorId && UUID_RE.test(event.actorId) ? event.actorId : null,
    target: event.target ? event.target.slice(0, 200) : null,
    result: event.result,
    detail: event.detail ?? null,
    request_id: event.requestId ? event.requestId.slice(0, 100) : null,
    ip_hash: hashIp(event.ip),
    event_count: event.count,
    fingerprint: event.fingerprint.slice(0, 200),
    metadata: event.metadata,
    occurred_at: event.timestamp,
  };
}

function scheduleFlush(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
  // Never hold the process open for a telemetry flush.
  (timer as unknown as { unref?: () => void }).unref?.();
}

/**
 * Write everything buffered. Safe to call concurrently: a call made while a
 * flush is in flight joins that flush rather than starting a second one, so
 * awaiting this always means "the batch that was pending has been written".
 */
export async function flush(): Promise<void> {
  if (inFlight) return inFlight;
  if (disabled || buffer.length === 0) return;
  const db = serviceClient();
  if (!db) return;

  inFlight = doFlush(db);
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
  // A batch that arrived while this one was in flight still needs a tick.
  if (buffer.length > 0) scheduleFlush();
}

async function doFlush(db: SupabaseClient): Promise<void> {
  const batch = buffer;
  buffer = [];

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { error } = await db.from("security_events").insert(batch);
      if (!error) break;

      // 42P01 / PGRST205 = the table does not exist (0127 not applied yet).
      // Disable rather than retry forever: the deployment is simply running
      // ahead of its migration, and the console lines still record everything.
      if (error.code === "42P01" || error.code === "PGRST205") {
        disabled = true;
        console.warn(
          "[security-sink] security_events table missing (migration 0127 not applied) — durable security events disabled; console logging continues.",
        );
        break;
      }

      if (attempt === MAX_ATTEMPTS) {
        console.error(
          `[security-sink] dropped ${batch.length} security event(s) after ${MAX_ATTEMPTS} attempts: ${error.message}`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  } catch (e) {
    console.error(
      "[security-sink] flush failed:",
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    if (droppedSinceReport > 0) {
      console.error(
        `[security-sink] buffer overflow: ${droppedSinceReport} security event(s) dropped before persistence`,
      );
      droppedSinceReport = 0;
    }
  }
}

/**
 * The sink itself. Synchronous, allocation-only, never throws — this is what
 * `registerSecuritySink()` installs and what runs inside every request that
 * records a security event.
 */
export function securitySink(event: NormalizedSecurityEvent): void {
  if (disabled) return;
  try {
    if (buffer.length >= MAX_BUFFER) {
      buffer.shift();
      droppedSinceReport++;
    }
    buffer.push(toRow(event));

    if (event.severity <= URGENT_SEVERITY || buffer.length >= BATCH_SIZE) {
      // Fire-and-forget: a Sev 1/2 event should reach the table promptly, but
      // the request must not wait for it.
      void flush();
    } else {
      scheduleFlush();
    }
  } catch {
    // The console line in lib/security-log.ts is already written; a broken
    // sink must never surface to the caller.
  }
}

/** Exported for tests and for a graceful shutdown path. */
export async function _drain(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await flush();
}

/** Exported for tests only. */
export function _resetSink(): void {
  buffer = [];
  if (timer) clearTimeout(timer);
  timer = null;
  inFlight = null;
  disabled = false;
  droppedSinceReport = 0;
  client = null;
}

/** Exported for tests only. */
export function _sinkState() {
  return { buffered: buffer.length, disabled, dropped: droppedSinceReport };
}
