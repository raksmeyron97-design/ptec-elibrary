/**
 * A provider's cover image, fetched by the server — never hotlinked.
 *
 * Open Library serves `covers.openlibrary.org/b/id/<id>-L.jpg` by redirecting
 * to archive.org, which the site's CSP does not allow (measured 2026-09-25: a
 * record saved with that URL showed a broken cover). So the browser never loads
 * one: the admin sees it through /api/admin/catalogs/cover-preview, and on Save
 * the server fetches it, runs it through the ordinary cover pipeline (sniff,
 * minimum size, re-encode) and stores it in PTEC storage.
 *
 * This is a server making requests to a URL that arrived in a form, so it is
 * SSRF-shaped, and every rule below is the defence:
 *   • one exact URL shape is accepted — Open Library's large cover by numeric id;
 *   • redirects are followed BY HAND, at most MAX_HOPS, and every hop must be
 *     https on Open Library's or the Internet Archive's own hosts;
 *   • the body is read to COVER_MAX_BYTES and no further;
 *   • the bytes must sniff as JPEG, PNG or WebP.
 * Google Books thumbnails are not offered: they are ~128 px wide, below the
 * pipeline's 300×450 minimum, so every one would be refused.
 */
import { COVER_MAX_BYTES, sniffImageType } from "@/lib/catalog-cover-shared";
import type { FetchLike } from "./types";

const SOURCE = /^https:\/\/covers\.openlibrary\.org\/b\/id\/[1-9]\d{0,11}-L\.jpg$/;
const HOP_HOSTS = [/^covers\.openlibrary\.org$/, /^archive\.org$/, /^ia\d{1,6}\.us\.archive\.org$/];
export const MAX_HOPS = 4;

export function openLibraryCoverSource(coverId: number): string | null {
  return Number.isSafeInteger(coverId) && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null;
}

/** The only cover URLs the server will ever fetch. */
export function isAllowedCoverSource(url: unknown): url is string {
  return typeof url === "string" && SOURCE.test(url);
}

function hopAllowed(u: URL): boolean {
  return u.protocol === "https:" && !u.username && !u.password && !u.port && HOP_HOSTS.some((h) => h.test(u.hostname));
}

export type CoverFetch =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false; reason: "not_allowed" | "redirect_not_allowed" | "too_many_redirects" | "http" | "too_large" | "timeout" | "unreachable" | "not_an_image" };

export async function fetchCoverSource(
  source: string,
  o: { fetch: FetchLike; timeoutMs?: number; maxBytes?: number },
): Promise<CoverFetch> {
  if (!isAllowedCoverSource(source)) return { ok: false, reason: "not_allowed" };
  const maxBytes = o.maxBytes ?? COVER_MAX_BYTES;
  // Measured 2026-09-25: 5.6–6.8 s through Open Library's two redirects. The
  // budget covers every hop together, so it is generous — this runs for a
  // preview or on Save, never on a keystroke.
  const signal = AbortSignal.timeout(o.timeoutMs ?? 20_000);

  let url = new URL(source);
  let res: Response;
  for (let hop = 0; ; hop++) {
    try {
      res = await o.fetch(url.toString(), { redirect: "manual", signal, cache: "no-store" });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return { ok: false, reason: timedOut ? "timeout" : "unreachable" };
    }
    if (res.status < 300 || res.status >= 400) break;
    const location = res.headers.get("location");
    if (!location) return { ok: false, reason: "http" };
    if (hop + 1 >= MAX_HOPS) return { ok: false, reason: "too_many_redirects" };
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      return { ok: false, reason: "redirect_not_allowed" };
    }
    if (!hopAllowed(next)) return { ok: false, reason: "redirect_not_allowed" };
    url = next;
  }
  if (!res.ok) return { ok: false, reason: "http" };

  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };

  // Read no further than the cap, whatever the header claimed.
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, reason: "http" };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: signal.aborted ? "timeout" : "unreachable" };
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  if (!sniffImageType(bytes)) return { ok: false, reason: "not_an_image" };
  return { ok: true, bytes: bytes.buffer };
}

/** A sentence for the librarian, by reason. */
export function coverFetchMessage(reason: Exclude<CoverFetch, { ok: true }>["reason"]): string {
  switch (reason) {
    case "too_large": return "The found cover is larger than 5 MB.";
    case "not_an_image": return "The found cover is not a JPEG, PNG or WebP image.";
    case "timeout": return "The cover source did not answer in time.";
    case "unreachable": return "The cover source could not be reached.";
    case "not_allowed":
    case "redirect_not_allowed":
    case "too_many_redirects": return "The found cover comes from a source this library does not fetch from.";
    default: return "The found cover could not be downloaded.";
  }
}
