// lib/verify/http.ts
//
// One fault vocabulary for every production verifier in scripts/verify-*.ts.
//
// ── The defect this exists to remove ─────────────────────────────────────────
//
// The verifiers each grew their own try/catch, and they did not agree. In
// verify-curriculum-links.ts a dropped connection was recorded as `fail` in one
// section and `warn` in the next — the same event, two verdicts, twelve lines
// apart. Running all four back to back on 2026-09-13 produced one `fail` and
// one aborted run; re-running each individually passed 79/79. Nothing was wrong
// with the site.
//
// That is not a cosmetic problem. A post-deploy gate exists to catch a
// regression somebody shipped, and a socket reset is not evidence about that.
// A check that goes red for network weather trains its readers to ignore red,
// and the alert they then ignore is the real one — the same reasoning that
// keeps `SECURITY_ALERT_MIN_SEVERITY` from promoting blocked login attempts
// (CLAUDE.md § Security Monitoring).
//
// ── The vocabulary ───────────────────────────────────────────────────────────
//
//   ok       the server answered and the answer satisfies the rule
//   fail     the server answered and the answer CONTRADICTS the rule — a defect
//   warn     the server answered that the fixture is gone (404/410) — cataloguing
//            drift, not a broken rule
//   unknown  no answer was obtained. Says nothing about the site, and must
//            never be counted as either a pass or a defect.
//
// The distinction is "did the origin answer", not "did we like the answer".

export type Outcome = "ok" | "fail" | "warn" | "unknown";

/** No answer was obtained: DNS, refused, reset, timeout, TLS. */
export class TransportError extends Error {
  readonly attempts: number;
  constructor(message: string, attempts: number) {
    super(message);
    this.name = "TransportError";
    this.attempts = attempts;
  }
}

/** The origin answered, with a status the caller did not want. */
export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

/** Backoff between attempts, in ms. Two retries, then give up. */
export const RETRY_DELAYS_MS = [500, 1000] as const;
const DEFAULT_TIMEOUT_MS = 25_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A 5xx or 429 is the origin answering badly rather than not answering, but it
 * is just as likely to be a deploy rolling underneath us — so it is RETRIED,
 * and only counts as an answer if it persists. A 4xx is a considered reply and
 * is never retried: asking again cannot change a 404.
 */
function retriable(status: number): boolean {
  return status === 429 || status >= 500;
}

export type FetchOptions = {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  /** Statuses the caller will interpret itself instead of treating as an error. */
  allowStatuses?: readonly number[];
  /**
   * `"manual"` when the REDIRECT ITSELF is the thing being checked — a sitemap
   * must advertise the canonical URL, not a hop to it, and following the hop
   * would report the destination's 200 and hide the defect. Pair it with
   * `allowStatuses` covering 301/302/307/308, or the redirect is thrown as an
   * unwanted status rather than returned to be inspected.
   */
  redirect?: RequestRedirect;
};

/**
 * Fetch with retry, distinguishing "no answer" from "an answer we dislike".
 *
 * Throws {@link TransportError} only after every attempt failed to get a
 * response at all, and {@link HttpStatusError} when the origin answered with an
 * unwanted status. Callers map those to `unknown` and `fail`/`warn` via
 * {@link classifyError}.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchOptions = {},
): Promise<Response> {
  const {
    method = "GET",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    allowStatuses = [],
    redirect = "follow",
  } = opts;
  const attempts = RETRY_DELAYS_MS.length + 1;
  let lastTransport = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);

    let res: Response;
    try {
      // AbortSignal.timeout rather than a bare fetch: a hung socket that never
      // settles is the failure mode this whole module is about, and without a
      // deadline it stalls the run instead of being reported.
      res = await fetch(url, { method, redirect, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      lastTransport = (err as Error).message || String(err);
      continue;
    }

    if (res.ok || allowStatuses.includes(res.status)) return res;
    if (retriable(res.status) && attempt < attempts - 1) {
      lastTransport = "";
      continue;
    }
    throw new HttpStatusError(res.status, url);
  }

  throw new TransportError(lastTransport || "no response", attempts);
}

/** Body text, with the same fault semantics as {@link fetchWithRetry}. */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  try {
    return await res.text();
  } catch (err) {
    // The response began and then the connection died — still no answer.
    throw new TransportError(`body read failed: ${(err as Error).message}`, 1);
  }
}

/**
 * Turn a thrown error into an outcome.
 *
 * The ONLY thing that produces `unknown` is a transport failure. Everything
 * else answered, and an answer that breaks a rule is a defect.
 */
export function classifyError(err: unknown): { outcome: Outcome; detail: string } {
  if (err instanceof TransportError) {
    return {
      outcome: "unknown",
      detail: `no answer after ${err.attempts} attempt(s) — ${err.message} (transport, NOT a site defect)`,
    };
  }
  if (err instanceof HttpStatusError) {
    // A missing fixture is cataloguing drift; anything else is ours.
    const outcome: Outcome = err.status === 404 || err.status === 410 ? "warn" : "fail";
    return { outcome, detail: err.message };
  }
  return { outcome: "fail", detail: (err as Error)?.message ?? String(err) };
}

/**
 * {@link classifyError} as a positional pair, for `record(check, ...errorOutcome(err))`.
 * Spreading `Object.values()` of the object form would silently depend on key
 * order — a rename of one field would swap the verdict and the message.
 */
export function errorOutcome(err: unknown): [Outcome, string] {
  const { outcome, detail } = classifyError(err);
  return [outcome, detail];
}

export type Tally = { ok: number; fail: number; warn: number; unknown: number };

export function tally(outcomes: readonly Outcome[]): Tally {
  const t: Tally = { ok: 0, fail: 0, warn: 0, unknown: 0 };
  for (const o of outcomes) t[o]++;
  return t;
}

/**
 * The summary line. `unknown` is reported SEPARATELY and never folded into
 * either side: "7 passed, 3 could not be checked" is a different claim from
 * "10 passed", and printing the second when the first is true is how a verifier
 * comes to certify what it never looked at.
 */
export function summaryLine(t: Tally): string {
  const parts = [`${t.ok} passed`];
  if (t.warn) parts.push(`${t.warn} warned`);
  if (t.fail) parts.push(`${t.fail} FAILED`);
  if (t.unknown) parts.push(`${t.unknown} could not be checked`);
  return parts.join(", ");
}

/**
 * Process exit code.
 *
 * A defect exits 1. An INCOMPLETE run exits 0 unless `strict`, because the
 * post-deploy workflow does `exit "$rc"` — so returning non-zero for a socket
 * reset would paint the build red for weather, which is precisely the habit
 * this module removes. The incompleteness is instead made impossible to miss
 * in the summary and in the JSON artifact, where the alerting layer can see it.
 */
export function exitCodeFor(t: Tally, strict = false): number {
  if (t.fail > 0) return 1;
  if (strict && (t.unknown > 0 || t.warn > 0)) return 1;
  return 0;
}

/** The banner an incomplete run must print, so "0 failed" is never read as "verified". */
export function incompleteBanner(t: Tally): string | null {
  if (t.unknown === 0) return null;
  return (
    `INCOMPLETE: ${t.unknown} check(s) got no answer from the origin. ` +
    `This run did NOT verify them — it is not evidence that they pass.`
  );
}
