// How a visitor ARRIVED (SEO audit 2026-10, WI-3 / P2-10).
//
// Nothing recorded whether a session began at a search engine, so the cost of
// the sign-in wall — search visitors who land on a book and never open it —
// could not be measured. The class has to be decided IN THE BROWSER, on the
// landing page: a Server Action's Referer is the page that called it, never
// the page the visitor came from.
//
// Privacy is structural. The classifier takes a HOST, never a URL (a referrer
// URL can carry a search query), and refuses anything shaped like one; the
// browser stores only the resulting class, under one sessionStorage key, for
// the life of the tab; and the server stores only that class.

export const ENTRY_CLASSES = ["search", "social", "referral", "direct", "internal"] as const;
export type EntryClass = (typeof ENTRY_CLASSES)[number];

export function isEntryClass(value: unknown): value is EntryClass {
  return typeof value === "string" && (ENTRY_CLASSES as readonly string[]).includes(value);
}

/** Search engines, as hosts. `google.*`, `yahoo.*` and `yandex.*` cover their
 *  country domains (google.com.kh, search.yahoo.co.jp, yandex.ru). */
const SEARCH_HOSTS: readonly RegExp[] = [
  /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/,
  /(^|\.)bing\.com$/,
  /(^|\.)duckduckgo\.com$/,
  /(^|\.)yahoo\.[a-z]{2,3}(\.[a-z]{2})?$/,
  /(^|\.)yandex\.[a-z]{2,3}(\.[a-z]{2})?$/,
  /(^|\.)baidu\.com$/,
];

const SOCIAL_HOSTS = new Set(["facebook.com", "m.facebook.com", "l.facebook.com", "lm.facebook.com", "t.me", "telegram.org"]);

/** Anything a host cannot contain: a scheme, a path, a query, a fragment,
 *  credentials or whitespace. A port is allowed (`localhost:3000`). */
const NOT_A_HOST = /[/?#@\s]/;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

/**
 * Classify a referrer HOST against this site's own host. Throws on a URL —
 * passing one is a privacy bug, and a silent "referral" would hide it.
 */
export function classifyEntry(referrerHost: string | null | undefined, ownHost: string): EntryClass {
  if (referrerHost === null || referrerHost === undefined || referrerHost.trim() === "") return "direct";
  if (NOT_A_HOST.test(referrerHost.trim())) {
    throw new TypeError("classifyEntry takes a host, never a URL");
  }
  const host = normalizeHost(referrerHost);
  if (host === normalizeHost(ownHost)) return "internal";
  if (SEARCH_HOSTS.some((re) => re.test(host))) return "search";
  if (SOCIAL_HOSTS.has(host)) return "social";
  return "referral";
}

/** The one sessionStorage key. Holds a class, nothing else. */
export const ENTRY_STORAGE_KEY = "ptec.entry";

/**
 * The class of the visit this tab LANDED with — browser only. Decided once per
 * tab session from `document.referrer` on the first page that asks, then read
 * back, so a later page reached by a click still says how the session began.
 * Never throws: storage can be blocked, and a referrer can be malformed.
 */
export function landingEntryClass(): EntryClass | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(ENTRY_STORAGE_KEY);
    if (isEntryClass(stored)) return stored;
  } catch {
    /* storage blocked — classify without remembering */
  }
  let entry: EntryClass;
  try {
    const host = document.referrer ? new URL(document.referrer).host : null;
    entry = classifyEntry(host, window.location.host);
  } catch {
    return null;
  }
  try {
    window.sessionStorage.setItem(ENTRY_STORAGE_KEY, entry);
  } catch {
    /* private mode — the class still rides on this request */
  }
  return entry;
}
