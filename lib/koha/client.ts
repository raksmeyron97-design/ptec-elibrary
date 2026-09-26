/**
 * The Koha REST client — the only code that talks to Koha.
 *
 * Pure (no `process.env`, no `server-only`): configuration and `fetch` are
 * injected, so tests and scripts run the same code the server does. The
 * server-only entry point is lib/koha/index.ts.
 *
 * Rules this file keeps, each for a reason:
 *   • The URL is built from the configured base and an allow-listed path —
 *     never from a caller-supplied URL — so nothing can steer a privileged
 *     request elsewhere (SSRF). Path parameters go through kohaPath(), which
 *     encodes each as ONE segment.
 *   • Every call has a timeout and an `x-koha-request-id`, so a slow Koha
 *     costs a bounded wait and a failure can be found in Koha's logs. The id
 *     is a positive INTEGER: Koha 26.05 declares that header `type: integer`
 *     (swagger.yaml `request_id_header`, on 49 paths incl. /libraries and
 *     /biblios) and answers 400 "Expected integer - got string" to anything
 *     else. A UUID passed every mock test and failed the first live Koha.
 *   • Only GET is retried, and only on a transient failure. A write that timed
 *     out may still have happened; repeating it is how duplicate records are
 *     made. So write() sends ONCE (a 401 aside: Koha refused it before doing
 *     anything, so re-sending with a fresh token is safe).
 *   • Writes (Phase 5) are narrower still: only in `write` mode (or the
 *     in-process mock), only a MARC-in-JSON body, and only to the two record
 *     paths — POST /biblios and PUT /biblios/{id}. Never DELETE, never items.
 *   • A 401 refreshes the token once — Koha may have restarted or expired it —
 *     and then reports the credentials as wrong rather than looping.
 *   • A 2xx body is checked against the shape the caller expects; a body that
 *     does not match is an error, never a half-read record.
 */
import { createTokenProvider, type FetchLike, type TokenProvider } from "./auth";
import type { KohaConfig, KohaMode } from "./config";
import { KohaError, kohaErrorFromResponse } from "./errors";
import { createMockKoha } from "./mock";

export type Query = Record<string, string | number | boolean | undefined>;
export type Validate<T> = (value: unknown) => value is T;

export interface KohaResponse<T> {
  data: T;
  /** `X-Total-Count`, when Koha sent one (list endpoints). */
  total: number | null;
  requestId: string;
}

/** Response formats a caller may ask for. JSON everywhere; MARC-in-JSON where Koha offers records as MARC (GET /biblios). */
export type KohaAccept = "application/json" | "application/marc-in-json";
/** `x-koha-embed` values a caller may send. A closed list, like the paths: nothing a caller passes becomes a header freely. */
export const KOHA_EMBEDS = ["+strings"] as const;
export type KohaEmbed = (typeof KOHA_EMBEDS)[number];

export interface KohaGetOptions {
  query?: Query;
  signal?: AbortSignal;
  accept?: KohaAccept;
  embed?: readonly KohaEmbed[];
  /**
   * This call's time budget, in place of KOHA_TIMEOUT_MS — for background
   * bulk reads (the sync), where a page legitimately takes seconds and nobody
   * is waiting on it. Capped at KOHA_MAX_TIMEOUT_MS; interactive calls leave it
   * unset and keep the configured budget.
   */
  timeoutMs?: number;
}

/** The ceiling on a per-call budget: one stuck request must not hold a run for long. */
export const KOHA_MAX_TIMEOUT_MS = 120_000;

export interface KohaWriteOptions {
  /** `x-confirm-not-duplicate`: create even though Koha's FindDuplicate matched (a librarian's explicit override). */
  confirmNotDuplicate?: boolean;
  signal?: AbortSignal;
  /** Default KOHA_WRITE_TIMEOUT_MS; capped at KOHA_MAX_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * A librarian is waiting on a write, but a write that times out is ambiguous —
 * it may have happened — so it gets a generous budget rather than the 8 s
 * interactive default: fewer "we cannot tell whether it was saved" answers.
 */
export const KOHA_WRITE_TIMEOUT_MS = 30_000;

/** The only writes: create a record, replace a record. */
export type KohaWriteMethod = "POST" | "PUT";
const WRITE_PATHS: Record<KohaWriteMethod, RegExp> = { POST: /^\/biblios$/, PUT: /^\/biblios\/[1-9]\d*$/ };

export interface KohaClient {
  readonly mode: KohaMode;
  get<T>(path: string, validate: Validate<T>, opts?: KohaGetOptions): Promise<KohaResponse<T>>;
  /** Send a MARC-in-JSON record. Refused unless the mode allows writes; never retried. */
  write<T>(method: KohaWriteMethod, path: string, record: unknown, validate: Validate<T>, opts?: KohaWriteOptions): Promise<KohaResponse<T>>;
}

export interface KohaClientDeps {
  fetch?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newRequestId?: () => string;
}

/** Delays before the 2nd and 3rd attempt of an idempotent read. */
export const RETRY_DELAYS_MS = [300, 1_000] as const;

// One or more segments of unreserved characters or percent-escapes.
const SAFE_PATH = /^(\/(?:[A-Za-z0-9_\-.~]|%[0-9A-Fa-f]{2})+)+$/;

/** Throws unless `path` is a plain API path under /api/v1 — no scheme, host, traversal or query. */
export function assertSafePath(path: string): void {
  if (!SAFE_PATH.test(path) || path.split("/").some((s) => s === "." || s === "..")) {
    throw new KohaError("invalid_request", `Refused to call Koha at an unsafe path.`);
  }
}

/**
 * `kohaPath("/biblios/{id}/items", { id: 42 })` → `/biblios/42/items`. Each
 * value is encoded as a single segment, so a barcode like `A/../x` stays data.
 */
export function kohaPath(template: string, params: Record<string, string | number> = {}): string {
  const path = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!(key in params)) throw new KohaError("invalid_request", `kohaPath: missing parameter "${key}".`);
    return encodeURIComponent(String(params[key]));
  });
  assertSafePath(path);
  return path;
}

function refusal(cfg: KohaConfig): KohaError | null {
  if (cfg.mode === "off") return new KohaError("disabled", "The Koha integration is switched off (KOHA_INTEGRATION=off).");
  if (cfg.mode === "mock") return null;
  if (cfg.problems.length > 0) return new KohaError("config", `The Koha integration is not configured: ${cfg.problems.join(" ")}`);
  return null;
}

/**
 * A random positive 31-bit integer, as text. Random rather than a counter so
 * two PTEC processes are unlikely to reuse an id in Koha's logs; 31 bits so it
 * is an integer to every JSON Schema validator and to a signed 32-bit column.
 */
export function newKohaRequestId(): string {
  return String((crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1);
}

export function createKohaClient(cfg: KohaConfig, deps: KohaClientDeps = {}): KohaClient {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const newRequestId = deps.newRequestId ?? newKohaRequestId;
  const refused = refusal(cfg);

  let baseUrl = "";
  let doFetch: FetchLike = () => Promise.reject(refused);
  let tokens: TokenProvider | null = null;
  if (!refused) {
    if (cfg.mode === "mock") {
      const mock = createMockKoha();
      baseUrl = mock.baseUrl;
      doFetch = deps.fetch ?? mock.fetch;
      tokens = createTokenProvider({ baseUrl, clientId: "mock", clientSecret: "mock", timeoutMs: cfg.timeoutMs, fetch: doFetch, now: deps.now });
    } else {
      baseUrl = cfg.baseUrl!;
      doFetch = deps.fetch ?? ((input, init) => fetch(input, init));
      tokens = createTokenProvider({
        baseUrl, clientId: cfg.clientId!, clientSecret: cfg.clientSecret!, timeoutMs: cfg.timeoutMs, fetch: doFetch, now: deps.now,
      });
    }
  }

  type SendExtra = {
    accept: KohaAccept;
    embed: string | null;
    timeoutMs: number;
    method?: KohaWriteMethod;
    body?: string;
    confirmNotDuplicate?: boolean;
  };

  async function send(url: string, token: string, requestId: string, outer: AbortSignal | undefined, extra: SendExtra): Promise<Response> {
    const timeout = AbortSignal.timeout(extra.timeoutMs);
    const signal = outer ? AbortSignal.any([timeout, outer]) : timeout;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: extra.accept,
      "x-koha-request-id": requestId,
    };
    if (extra.embed) headers["x-koha-embed"] = extra.embed;
    if (cfg.libraryId) headers["x-koha-library"] = cfg.libraryId;
    if (extra.method) {
      headers["Content-Type"] = "application/marc-in-json";
      if (extra.confirmNotDuplicate) headers["x-confirm-not-duplicate"] = "1";
    }
    try {
      return extra.method
        ? await doFetch(url, { method: extra.method, headers, body: extra.body, signal, cache: "no-store" })
        : await doFetch(url, { method: "GET", headers, signal, cache: "no-store" });
    } catch {
      if (outer?.aborted) throw new KohaError("timeout", "The Koha call was cancelled.", { requestId });
      if (timeout.aborted) throw new KohaError("timeout", `Koha did not answer within ${extra.timeoutMs} ms.`, { requestId });
      throw new KohaError("unreachable", "Koha is unreachable.", { requestId });
    }
  }

  async function once<T>(url: string, where: string, validate: Validate<T>, outer: AbortSignal | undefined, extra: SendExtra): Promise<KohaResponse<T>> {
    const requestId = newRequestId();
    let token = await tokens!.getToken();
    let res = await send(url, token, requestId, outer, extra);
    if (res.status === 401) {
      tokens!.invalidate(token);
      token = await tokens!.getToken();
      res = await send(url, token, requestId, outer, extra);
    }

    let body: unknown = null;
    let parsed = true;
    try {
      body = await res.json();
    } catch {
      parsed = false;
    }
    if (!res.ok) throw kohaErrorFromResponse(res.status, parsed ? body : null, where, requestId);
    if (!parsed || !validate(body)) {
      throw new KohaError("bad_response", `Koha answered ${where} with a body this integration does not recognise.`, {
        status: res.status,
        requestId,
      });
    }
    const totalHeader = res.headers.get("x-total-count");
    const total = totalHeader !== null && /^\d+$/.test(totalHeader) ? Number(totalHeader) : null;
    return { data: body, total, requestId };
  }

  return {
    mode: cfg.mode,
    async get<T>(path: string, validate: Validate<T>, opts: KohaGetOptions = {}) {
      if (refused) throw refused;
      assertSafePath(path);
      const accept: KohaAccept = opts.accept === "application/marc-in-json" ? "application/marc-in-json" : "application/json";
      const embeds = (opts.embed ?? []).filter((e): e is KohaEmbed => (KOHA_EMBEDS as readonly string[]).includes(e));
      const timeoutMs = opts.timeoutMs !== undefined && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
        ? Math.min(opts.timeoutMs, KOHA_MAX_TIMEOUT_MS)
        : cfg.timeoutMs;
      const extra: SendExtra = { accept, embed: embeds.length ? embeds.join(",") : null, timeoutMs };
      const url = new URL(`${baseUrl}/api/v1${path}`);
      for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
      const where = `GET ${path}`;

      for (let attempt = 0; ; attempt++) {
        try {
          return await once(url.toString(), where, validate, opts.signal, extra);
        } catch (e) {
          const err = e instanceof KohaError ? e : new KohaError("unreachable", `Koha call failed (${where}).`);
          if (!err.retryable || attempt >= RETRY_DELAYS_MS.length || opts.signal?.aborted) throw err;
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    },

    async write<T>(method: KohaWriteMethod, path: string, record: unknown, validate: Validate<T>, opts: KohaWriteOptions = {}) {
      if (refused) throw refused;
      if (cfg.mode !== "write" && cfg.mode !== "mock") {
        throw new KohaError("config", "Writing to Koha needs KOHA_INTEGRATION=write.");
      }
      assertSafePath(path);
      if (!WRITE_PATHS[method]?.test(path)) {
        throw new KohaError("invalid_request", `Refused to send ${method} ${path}: the e-Library writes only records (POST /biblios, PUT /biblios/{id}).`);
      }
      const timeoutMs = opts.timeoutMs !== undefined && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
        ? Math.min(opts.timeoutMs, KOHA_MAX_TIMEOUT_MS)
        : KOHA_WRITE_TIMEOUT_MS;
      const extra: SendExtra = {
        accept: "application/json", embed: null, timeoutMs, method,
        body: JSON.stringify(record), confirmNotDuplicate: opts.confirmNotDuplicate === true,
      };
      // ONE attempt. A timeout or a dropped connection is reported as such, and
      // the caller must treat the outcome as unknown — never send it again blind.
      try {
        return await once(`${baseUrl}/api/v1${path}`, `${method} ${path}`, validate, opts.signal, extra);
      } catch (e) {
        throw e instanceof KohaError ? e : new KohaError("unreachable", `Koha call failed (${method} ${path}).`);
      }
    },
  };
}
