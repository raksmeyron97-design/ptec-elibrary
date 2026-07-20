/**
 * Destination-URL safety for announcements (CTA link + push click URL).
 * Pure — no server-only imports — so it is usable from validation, server
 * actions, AND unit tests without pulling in Supabase/next/headers.
 *
 * Rules:
 *   - A same-origin relative path ("/books/foo") is always safe.
 *   - An absolute URL must be https and its hostname must be the site's own
 *     domain or explicitly allow-listed via ANNOUNCEMENT_EXTERNAL_URL_ALLOWLIST
 *     (comma-separated hostnames). Nothing else — no javascript:, data:, ftp:,
 *     protocol-relative ("//evil.com"), or unlisted external host.
 */

import { PRODUCTION_SITE_URL } from "@/lib/seo/site";

export type UrlSafetyResult =
  | { ok: true; kind: "internal" | "external"; url: string }
  | { ok: false; reason: "empty" | "unsafe_scheme" | "protocol_relative" | "not_allowlisted" | "unparseable" };

function siteHostname(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL).hostname;
  } catch {
    return new URL(PRODUCTION_SITE_URL).hostname;
  }
}

function allowlistedHosts(): string[] {
  const extra = (process.env.ANNOUNCEMENT_EXTERNAL_URL_ALLOWLIST ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [siteHostname().toLowerCase(), ...extra];
}

/** Validate a destination URL for CTA links / push click targets. */
export function checkDestinationUrl(raw: string | null | undefined): UrlSafetyResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  // Protocol-relative URLs ("//evil.com") are the classic open-redirect trick
  // hiding inside what looks like a relative path — reject before anything else.
  if (trimmed.startsWith("//")) return { ok: false, reason: "protocol_relative" };

  if (trimmed.startsWith("/")) {
    return { ok: true, kind: "internal", url: trimmed };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "unsafe_scheme" };
  }

  const host = parsed.hostname.toLowerCase();
  const allowlist = allowlistedHosts();
  const isAllowed = allowlist.some((h) => host === h || host.endsWith(`.${h}`));
  if (!isAllowed) return { ok: false, reason: "not_allowlisted" };

  return { ok: true, kind: host === siteHostname().toLowerCase() ? "internal" : "external", url: trimmed };
}

export function isSafeDestinationUrl(raw: string | null | undefined): boolean {
  return checkDestinationUrl(raw).ok;
}
