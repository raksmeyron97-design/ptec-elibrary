/**
 * Koha integration configuration — pure, so the tests, the connection-check
 * script and the server all resolve the same answer from the same variables.
 *
 * Koha is the source of truth for the physical library once it exists
 * (docs/KOHA-INTEGRATION.md). Until then, and on every deployment that has not
 * been deliberately pointed at one, the integration is OFF: an unset or
 * unrecognised KOHA_INTEGRATION never turns it on. `mock` answers from an
 * in-process fake Koha (lib/koha/mock.ts) so the rest of the app can be built
 * and tested before a real instance is running.
 *
 * Secrets are env-only, server-only, never NEXT_PUBLIC_, and never appear in a
 * problem message: a problem names the VARIABLE, not its value.
 */

export const KOHA_MODES = ["off", "mock", "read", "write"] as const;
export type KohaMode = (typeof KOHA_MODES)[number];

export type EnvSource = Record<string, string | undefined>;

export const KOHA_DEFAULT_TIMEOUT_MS = 8_000;

export interface KohaConfig {
  mode: KohaMode;
  /** Origin (plus any path prefix) Koha is served from; `/api/v1` is appended per call. Null when unset or invalid. */
  baseUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  /** Sent as `x-koha-library` — the library a call acts for. Null means the API user's home library. */
  libraryId: string | null;
  timeoutMs: number;
  /** Blocking: with any of these the client refuses to call Koha. */
  problems: string[];
  /** Advisory: the integration works, but someone should look. */
  warnings: string[];
}

function mode(raw: string | undefined): KohaMode {
  const v = raw?.trim().toLowerCase();
  return (KOHA_MODES as readonly string[]).includes(v ?? "") ? (v as KohaMode) : "off";
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** A host that only exists on a private network — where plain http is tolerable. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * `https://koha.example/` → `https://koha.example`; a trailing `/api/v1` is
 * dropped because every call appends it. Refuses anything that is not a plain
 * http(s) origin: no credentials in the URL, no query, no fragment.
 */
export function normalizeKohaBaseUrl(raw: string): { url: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: "KOHA_BASE_URL is not a valid URL." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "KOHA_BASE_URL must use http or https." };
  if (u.username || u.password) return { error: "KOHA_BASE_URL must not carry credentials — use KOHA_CLIENT_ID / KOHA_CLIENT_SECRET." };
  if (u.search || u.hash) return { error: "KOHA_BASE_URL must not carry a query string or fragment." };
  const path = u.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
  return { url: `${u.origin}${path}` };
}

export function resolveKohaConfig(env: EnvSource): KohaConfig {
  const m = mode(env.KOHA_INTEGRATION);
  const problems: string[] = [];
  const warnings: string[] = [];
  const raw = env.KOHA_INTEGRATION?.trim();
  if (raw && m === "off" && raw.toLowerCase() !== "off") {
    warnings.push(`KOHA_INTEGRATION="${raw}" is not one of ${KOHA_MODES.join(", ")} — treated as off.`);
  }

  let baseUrl: string | null = null;
  if (env.KOHA_BASE_URL?.trim()) {
    const n = normalizeKohaBaseUrl(env.KOHA_BASE_URL);
    if ("error" in n) problems.push(n.error);
    else baseUrl = n.url;
  }
  const clientId = env.KOHA_CLIENT_ID?.trim() || null;
  const clientSecret = env.KOHA_CLIENT_SECRET?.trim() || null;
  const libraryId = env.KOHA_LIBRARY_ID?.trim() || null;

  // A real instance needs somewhere to go and something to log in with. Mock
  // and off need neither, so a half-configured environment does not block them.
  if (m === "read" || m === "write") {
    if (!env.KOHA_BASE_URL?.trim()) problems.push("KOHA_BASE_URL is not set.");
    if (!clientId) problems.push("KOHA_CLIENT_ID is not set.");
    if (!clientSecret) problems.push("KOHA_CLIENT_SECRET is not set.");
    if (baseUrl) {
      const host = new URL(baseUrl).hostname;
      if (baseUrl.startsWith("http:") && !isPrivateHost(host)) {
        warnings.push(`KOHA_BASE_URL uses plain http to a public host (${host}); the client secret would cross the network unencrypted.`);
      }
    }
  }
  if (libraryId && libraryId.length > 10) problems.push("KOHA_LIBRARY_ID is longer than Koha's 10-character library code.");

  return {
    mode: m,
    baseUrl,
    clientId,
    clientSecret,
    libraryId,
    timeoutMs: positiveInt(env.KOHA_TIMEOUT_MS, KOHA_DEFAULT_TIMEOUT_MS),
    problems,
    warnings,
  };
}

/** May anything read from Koha (or its mock) under this configuration? */
export function kohaCanRead(cfg: KohaConfig): boolean {
  return cfg.mode !== "off" && cfg.problems.length === 0;
}

/**
 * May anything WRITE to Koha? Only `write` mode, only when fully configured.
 * Nothing in Phase 1 writes; this exists so every later write asks one question.
 */
export function kohaCanWrite(cfg: KohaConfig): boolean {
  return cfg.mode === "write" && cfg.problems.length === 0;
}
