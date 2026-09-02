// lib/admin/import-queue.ts — rate-limit-aware transport for the bulk importer.
//
// Extracted from the importer component so the behaviour that matters most
// here can be tested without rendering anything: what the queue does when
// storage says "not for another 54 minutes".
//
// Zima allows 60 uploads per HOUR, counted per file and shared by the whole
// application (lib/zima.ts → ZIMA_UPLOADS_PER_HOUR). An 86-row import is ~172
// files, so it does not fit in one window and a 429 is an expected part of a
// normal run, not a failure. One observed reply asked for 3,224 seconds.
//
// The gate is shared by every worker: the FIRST 429 stops all of them, because
// the quota is per-IP and racing on through would only burn the counter and
// return the same 429 for each remaining row. That is exactly what happened
// before — 63 rows failed in a few seconds against a limit that had another 54
// minutes to run.

export interface QueueGate {
  /** Epoch ms until which no worker may send. 0 when running normally. */
  pausedUntil: number;
  /** Told the UI so it can render a countdown. */
  onPause: (until: number, reason: string) => void;
  onResume: () => void;
  /** Set by the Stop button; an hour-long wait must be escapable. */
  cancelled: boolean;
}

/** Transient (network / 5xx) retries per file, before the row is failed. */
export const MAX_TRANSIENT_ATTEMPTS = 3;
/** How many quota windows one file may wait out before we give up on it. */
export const MAX_RATE_LIMIT_WAITS = 4;
/** Cap a server-supplied wait, in case Retry-After is ever absurd. */
export const MAX_WAIT_SECONDS = 70 * 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class QueueCancelled extends Error {
  constructor() {
    super("Import stopped");
    this.name = "QueueCancelled";
  }
}

export async function waitForGate(gate: QueueGate): Promise<void> {
  while (gate.pausedUntil > Date.now()) {
    if (gate.cancelled) throw new QueueCancelled();
    // Short sleeps rather than one long one, so Stop is responsive during a
    // 54-minute pause and the countdown stays honest.
    await sleep(Math.min(gate.pausedUntil - Date.now(), 500));
  }
  if (gate.cancelled) throw new QueueCancelled();
}

/**
 * POST one file, waiting out rate limits and retrying transient faults.
 *
 * `body` is a File — re-readable, so the same request can be replayed. A
 * ReadableStream body could not be, which is why this takes the File itself.
 */
export async function postFile(url: string, init: RequestInit, gate: QueueGate): Promise<Response> {
  let transient = 0;
  let waits = 0;

  for (;;) {
    await waitForGate(gate);

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Offline, DNS, connection reset — retry a few times, then surface it.
      if (transient >= MAX_TRANSIENT_ATTEMPTS) throw err;
      transient += 1;
      await sleep(2 ** transient * 1000);
      continue;
    }

    if (res.status === 429) {
      if (waits >= MAX_RATE_LIMIT_WAITS) return res; // let the row fail, with the message
      waits += 1;
      const body = await res.clone().json().catch(() => ({}) as Record<string, unknown>);
      const fromBody = Number((body as { retryAfterSeconds?: number }).retryAfterSeconds);
      const fromHeader = Number(res.headers.get("retry-after"));
      const seconds = Math.min(
        MAX_WAIT_SECONDS,
        Number.isFinite(fromBody) && fromBody > 0
          ? fromBody
          : Number.isFinite(fromHeader) && fromHeader > 0
            ? fromHeader
            : 60,
      );
      const until = Date.now() + seconds * 1000;
      // Never shorten a pause another worker already set.
      if (until > gate.pausedUntil) {
        gate.pausedUntil = until;
        gate.onPause(until, String((body as { error?: string }).error ?? "Storage rate limit reached"));
      }
      continue; // waiting out a quota is not an attempt against this file
    }

    // 503 here is our own route relaying a Zima 5xx; both are worth retrying.
    if (res.status >= 500 && transient < MAX_TRANSIENT_ATTEMPTS) {
      transient += 1;
      await sleep(2 ** transient * 1000);
      continue;
    }

    if (gate.pausedUntil > 0 && gate.pausedUntil <= Date.now()) {
      gate.pausedUntil = 0;
      gate.onResume();
    }
    return res;
  }
}
