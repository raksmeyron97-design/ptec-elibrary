/**
 * One GET to a metadata provider, bounded and classified. Server-side only by
 * construction: callers pass fixed provider URLs; nothing here takes a URL
 * from a request.
 */
import type { FetchLike, ProviderErrorKind } from "../types";

export const ISBN_USER_AGENT = "PTEC-eLibrary/1.0 (+https://library.ptec.edu.kh)";

export type JsonAnswer =
  | { ok: true; status: number; body: unknown }
  | { ok: false; kind: ProviderErrorKind; status?: number };

/**
 * 2xx and 404 come back as answers (404 is how a provider says "no such ISBN");
 * everything else is an error with its kind. A 429 is always `quota` — the
 * one error the librarian can do something about (an API key).
 */
export async function fetchJson(fetch: FetchLike, url: string, timeoutMs: number): Promise<JsonAnswer> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": ISBN_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, kind: timedOut ? "timeout" : "unreachable" };
  }
  if (res.status === 429) return { ok: false, kind: "quota", status: 429 };
  if (!res.ok && res.status !== 404) return { ok: false, kind: "http", status: res.status };
  try {
    return { ok: true, status: res.status, body: res.status === 404 ? null : await res.json() };
  } catch {
    return { ok: false, kind: "bad_response", status: res.status };
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
export const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : [];

/** First plausible publication year in a free-text date ("December 27, 2017", "2016-01-05"). */
export function yearFrom(v: unknown): number | null {
  const m = typeof v === "string" ? v.match(/\b(1[5-9]\d{2}|20\d{2})\b/) : null;
  return m ? Number(m[1]) : null;
}

/** Plain text from a provider description: tags dropped, whitespace collapsed, bounded. */
export function plainText(v: unknown, max = 2_000): string | null {
  const s = str(v);
  if (!s) return null;
  const text = s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}
