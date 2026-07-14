/**
 * Open-redirect guard for the `returnTo` mechanism used by the download flow
 * (thesis → Settings → back to thesis). Only INTERNAL, same-origin application
 * paths are ever honoured; anything else falls back to a safe default.
 *
 * Pure and dependency-free so it can be unit-tested and used on both server
 * and client.
 */
export function safeReturnTo(
  raw: string | null | undefined,
  fallback = "/theses",
): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    return fallback;
  }
  // Must be an absolute internal path. Reject protocol-relative ("//host"),
  // backslash tricks ("/\\host", "\\host"), and any control characters that
  // could smuggle a scheme or header past naive checks.
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  // Reject any control character (newline, NUL, …) by char code — avoids a
  // control-char regex literal (linter-flagged and easily mangled in source).
  for (let i = 0; i < raw.length; i++) {
    if (raw.charCodeAt(i) < 0x20) return fallback;
  }

  // Resolve against a sentinel origin: a truly-internal path keeps that origin;
  // anything that escapes it (e.g. a parsed "https:" scheme) is rejected.
  try {
    const sentinel = "https://internal.invalid";
    const url = new URL(raw, sentinel);
    if (url.origin !== sentinel) return fallback;
    const resolved = `${url.pathname}${url.search}${url.hash}`;
    return resolved.startsWith("/") && !resolved.startsWith("//") ? resolved : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Build the deep link to the Download Access Profile section of Settings,
 * carrying a validated `returnTo` so the reader lands back on the thesis after
 * saving. `locale` prefixes the Khmer path (`/km/...`); English is unprefixed.
 */
export function downloadProfileSettingsPath(
  returnTo: string | null | undefined,
  locale?: string,
): string {
  const safe = safeReturnTo(returnTo);
  const base = locale === "km" ? "/km/dashboard/settings" : "/dashboard/settings";
  const params = new URLSearchParams({
    section: "download-profile",
    returnTo: safe,
  });
  return `${base}?${params.toString()}`;
}
