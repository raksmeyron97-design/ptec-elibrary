/**
 * Pure decision rules for the file-health sweep (scripts/check-file-health.ts).
 *
 * The sweep answers one question per URL — "does storage still serve this
 * file?" — and writes the answer into `file_health.status`, which the admin
 * dashboard renders as "PDF broken" / "Cover image broken". So the ONLY
 * responses that may produce `broken` are ones where the server actually said
 * the file is not there. A response that says "not now" is not evidence about
 * the file:
 *
 *   - HTTP 429: Zima meters `/files` reads per client IP (300/min anonymous,
 *     3000/min with a recognised `x-api-key`). One sweep is ~540 requests, so
 *     an anonymous run crossed the ceiling around request 300 and the
 *     remaining ~100 rows were written down as broken with `http_status 429`.
 *     That is the false alarm this module exists to prevent.
 *   - HTTP 5xx / 408 and network errors / timeouts: the origin is unwell or
 *     unreachable; the file may be perfectly fine.
 *
 * Those are retried with backoff (honouring `Retry-After`) and, if they never
 * settle, recorded as `unknown` — the dashboard's "couldn't be checked"
 * bucket — with the last HTTP status kept so the cause stays queryable.
 *
 * No I/O here on purpose: the sweep's classification is unit-tested offline.
 */

export type HealthStatus = "ok" | "broken" | "unknown";

export type ProbeVerdict = { status: HealthStatus; httpStatus: number | null };

export type ProbeDecision =
  | { kind: "settle"; verdict: ProbeVerdict }
  | { kind: "retry"; delayMs: number };

/** Total attempts per URL, including the first. */
export const MAX_PROBE_ATTEMPTS = 4;
/** First backoff step; doubles per attempt when the server sends no Retry-After. */
export const BASE_RETRY_DELAY_MS = 1_000;
/** Never sleep longer than this on one step, whatever Retry-After says. */
export const MAX_RETRY_DELAY_MS = 60_000;

/** A status that says "not now" rather than "not here". */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599);
}

/**
 * How long to wait after a failed `attempt` (1-based). A `Retry-After` header
 * wins when present and parseable (seconds, or an HTTP-date), clamped to
 * [BASE, MAX]; otherwise exponential backoff from BASE.
 */
export function retryDelayMs(attempt: number, retryAfter?: string | null, now: number = Date.now()): number {
  const clamp = (ms: number) => Math.min(MAX_RETRY_DELAY_MS, Math.max(BASE_RETRY_DELAY_MS, ms));
  if (retryAfter) {
    const trimmed = retryAfter.trim();
    if (/^\d+$/.test(trimmed)) return clamp(Number(trimmed) * 1_000);
    const at = Date.parse(trimmed);
    if (Number.isFinite(at)) return clamp(at - now);
  }
  const step = Math.max(0, attempt - 1);
  return clamp(BASE_RETRY_DELAY_MS * 2 ** step);
}

/**
 * Decide what to do with one probe response.
 *
 * `httpStatus: null` means the request produced no response at all (network
 * error, timeout) — treated as transient, never as broken.
 */
export function decideProbe(input: {
  httpStatus: number | null;
  attempt: number;
  retryAfter?: string | null;
  now?: number;
}): ProbeDecision {
  const { httpStatus, attempt } = input;

  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300) {
    return { kind: "settle", verdict: { status: "ok", httpStatus } };
  }

  const transient = httpStatus === null || isTransientStatus(httpStatus);
  if (!transient) {
    return { kind: "settle", verdict: { status: "broken", httpStatus } };
  }

  if (attempt < MAX_PROBE_ATTEMPTS) {
    return { kind: "retry", delayMs: retryDelayMs(attempt, input.retryAfter, input.now) };
  }
  return { kind: "settle", verdict: { status: "unknown", httpStatus } };
}

/**
 * Backends that reject HEAD outright answer 405/501; the sweep then re-asks
 * with a one-byte ranged GET. Kept here so the rule is tested with the rest.
 */
export function shouldFallBackToRangedGet(httpStatus: number): boolean {
  return httpStatus === 405 || httpStatus === 501;
}
