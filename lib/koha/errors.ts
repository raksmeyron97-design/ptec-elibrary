/**
 * What went wrong talking to Koha, and whose problem it is.
 *
 * The owner split is the one the indexing pipeline already uses
 * (lib/indexing/retry.ts FAILURE_KINDS), so a sync record can carry it without
 * a second vocabulary:
 *   transient — the world: Koha down, slow, overloaded, rate-limiting. Retry.
 *   permanent — the request: not found, conflict, rejected input. Retrying
 *               the same call changes nothing; a person must look.
 *   config    — ours: integration off or unconfigured, bad credentials, the API
 *               user lacks a permission, RESTOAuth2ClientCredentials is off.
 *               Says nothing about the record; fix the setup.
 *
 * A message is built for a librarian's screen and a log line: it names the
 * endpoint and Koha's own reason, and never a token, a secret or a patron's
 * personal data.
 */

export type KohaErrorKind =
  | "disabled"        // KOHA_INTEGRATION=off
  | "config"          // missing/invalid settings, or Koha refused our setup
  | "auth"            // credentials rejected (401, token endpoint)
  | "forbidden"       // 403 — the API user lacks a permission
  | "not_found"       // 404
  | "conflict"        // 409 / 412
  | "invalid_request" // 400 / 406 / a path we refuse to send
  | "rate_limited"    // 429
  | "server"          // 5xx
  | "unreachable"     // DNS / refused / reset — no HTTP answer at all
  | "timeout"         // no answer within the budget
  | "bad_response";   // a 2xx whose body is not what the API promises

export type KohaFailureKind = "transient" | "permanent" | "config";

const OWNER: Record<KohaErrorKind, KohaFailureKind> = {
  disabled: "config",
  config: "config",
  auth: "config",
  forbidden: "config",
  not_found: "permanent",
  conflict: "permanent",
  invalid_request: "permanent",
  rate_limited: "transient",
  server: "transient",
  unreachable: "transient",
  timeout: "transient",
  bad_response: "permanent",
};

export class KohaError extends Error {
  readonly kind: KohaErrorKind;
  readonly status?: number;
  /** Koha's `error_code`, when it sent one. */
  readonly kohaErrorCode?: string;
  /** Our `x-koha-request-id` for this call, for correlating with Koha's logs. */
  readonly requestId?: string;

  constructor(kind: KohaErrorKind, message: string, opts: { status?: number; kohaErrorCode?: string; requestId?: string } = {}) {
    super(message);
    this.name = "KohaError";
    this.kind = kind;
    this.status = opts.status;
    this.kohaErrorCode = opts.kohaErrorCode;
    this.requestId = opts.requestId;
  }

  get failureKind(): KohaFailureKind {
    return OWNER[this.kind];
  }

  /** Worth repeating the SAME idempotent call later. Never consulted for a write. */
  get retryable(): boolean {
    return this.failureKind === "transient";
  }
}

const MAX_REASON = 300;

/** Koha's `{ error, error_code, required_permissions? }` body, defensively. */
function readErrorBody(body: unknown): { reason?: string; code?: string; permissions?: string } {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const reason = typeof b.error === "string" ? b.error.replace(/\s+/g, " ").trim().slice(0, MAX_REASON) : undefined;
  const code = typeof b.error_code === "string" ? b.error_code.slice(0, 80) : undefined;
  let permissions: string | undefined;
  if (b.required_permissions && typeof b.required_permissions === "object") {
    permissions = JSON.stringify(b.required_permissions).slice(0, 200);
  }
  return { reason, code, permissions };
}

/** Turn a non-2xx Koha answer into a KohaError that says what happened. */
export function kohaErrorFromResponse(status: number, body: unknown, where: string, requestId?: string): KohaError {
  const { reason, code, permissions } = readErrorBody(body);
  const said = reason ? `: ${reason}` : "";
  const opts = { status, kohaErrorCode: code, requestId };
  if (status === 401) return new KohaError("auth", `Koha rejected the API credentials (${where})${said}`, opts);
  if (status === 403) {
    const need = permissions ? ` Required permissions: ${permissions}.` : "";
    return new KohaError("forbidden", `The Koha API user is not allowed to do this (${where})${said}.${need}`, opts);
  }
  if (status === 404) return new KohaError("not_found", `Koha has no such record (${where})${said}`, opts);
  if (status === 409 || status === 412) return new KohaError("conflict", `Koha refused a conflicting change (${where})${said}`, opts);
  if (status === 429) return new KohaError("rate_limited", `Koha is rate-limiting requests (${where})${said}`, opts);
  if (status >= 500) return new KohaError("server", `Koha answered ${status} (${where})${said}`, opts);
  return new KohaError("invalid_request", `Koha rejected the request with ${status} (${where})${said}`, opts);
}
