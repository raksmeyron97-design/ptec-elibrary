/**
 * OAuth2 client-credentials tokens for the Koha REST API.
 *
 * Koha issues a bearer token for an API key that belongs to a staff patron,
 * and every call then acts with THAT patron's permissions — there are no OAuth
 * scopes (api/v1/swagger.yaml, Koha/REST/V1/OAuth.pm). Tokens live 3600 s,
 * hard-coded on Koha's side; we refresh a minute early.
 *
 * The token is held in this process's memory only — never a cookie, never
 * localStorage, never a log line. The secret is sent only to the token
 * endpoint, in an Authorization: Basic header, which Koha accepts in place of
 * form fields.
 */
import { KohaError } from "./errors";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TokenProvider {
  getToken(): Promise<string>;
  /** Drop `token` if it is the cached one — call after a 401 so the next call re-authenticates. */
  invalidate(token: string): void;
}

export interface TokenProviderOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
  fetch: FetchLike;
  now?: () => number;
}

/** Refresh this long before Koha says the token expires. */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

export function createTokenProvider(o: TokenProviderOptions): TokenProvider {
  const now = o.now ?? Date.now;
  const where = "POST /api/v1/oauth/token";
  let cached: { token: string; refreshAt: number } | null = null;
  let inFlight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    let res: Response;
    try {
      res = await o.fetch(`${o.baseUrl}/api/v1/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${base64(`${o.clientId}:${o.clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(o.timeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw timedOut
        ? new KohaError("timeout", `Koha did not issue a token within ${o.timeoutMs} ms (${where}).`)
        : new KohaError("unreachable", `Koha is unreachable (${where}).`);
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* handled below */
    }

    if (!res.ok) {
      const reason = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error.slice(0, 200)
        : "";
      if (res.status === 400 && /unimplemented grant type/i.test(reason)) {
        // Koha answers this when RESTOAuth2ClientCredentials is off or the
        // Net::OAuth2::AuthorizationServer module is missing — our setup, not the record.
        throw new KohaError(
          "config",
          "Koha refused the client-credentials grant — enable the RESTOAuth2ClientCredentials system preference.",
          { status: 400 },
        );
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new KohaError("auth", `Koha rejected the API client credentials (${res.status}${reason ? `: ${reason}` : ""}).`, { status: res.status });
      }
      throw new KohaError(res.status >= 500 ? "server" : "invalid_request", `Koha's token endpoint answered ${res.status}.`, { status: res.status });
    }

    const b = body as { access_token?: unknown; expires_in?: unknown } | null;
    if (!b || typeof b.access_token !== "string" || !b.access_token) {
      throw new KohaError("bad_response", `Koha's token endpoint answered without an access_token (${where}).`);
    }
    const lifetimeMs = (typeof b.expires_in === "number" && b.expires_in > 0 ? b.expires_in : 3600) * 1000;
    // Never cache for less than 30 s, even if Koha is configured with a tiny lifetime.
    cached = { token: b.access_token, refreshAt: now() + Math.max(30_000, lifetimeMs - TOKEN_REFRESH_MARGIN_MS) };
    return b.access_token;
  }

  return {
    async getToken() {
      if (cached && now() < cached.refreshAt) return cached.token;
      // One request for everyone waiting — ten concurrent calls must not mint ten tokens.
      if (!inFlight) {
        inFlight = fetchToken().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
    invalidate(token) {
      if (cached?.token === token) cached = null;
    },
  };
}
