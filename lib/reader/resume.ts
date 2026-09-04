/* Exact-page resume: which page a returning reader lands on.

   Two sources, with different precision:
     • this device's localStorage holds the EXACT page (and the % it was), but
       knows nothing about other devices;
     • the server holds a rounded PERCENTAGE (≈5-page error on a 500-page
       book), synced from every device the reader signs in on.

   The exact page wins unless the server has clearly moved on — the book was
   read further on another device — in which case the server's position is the
   more recent one and must not be overwritten by a stale local page. */

export type LocalPosition = {
  p?: number;
  pct?: number;
  /** When this device wrote the record (ms). */
  t?: number;
  /** The percentage this device last successfully sent to the server. */
  s?: number;
} | null;

export type ResumeInput = {
  local: LocalPosition;
  /** Server progress %, 0 when unknown or logged out. */
  serverPct: number;
  /** When the server position was written (ms since epoch), if known. */
  serverAt?: number | null;
  isLoggedIn: boolean;
  /** Real page count from the loaded document (the `pages` column is unreliable). */
  numPages: number;
};

/** Tolerance in percentage points within which local and server agree. */
export const RESUME_TOLERANCE_PCT = 2;
/** Clock slack when comparing a device timestamp with the server's. The
    server stamp is written by the app server, the device stamp by the
    browser; a second absorbs ordinary drift without swallowing the common
    case (one page turn, then the tab closes before the 1.5 s autosave). */
const CLOCK_SLACK_MS = 1000;

/** The page to land on, or null to keep the caller's default (page 1 or the
    server-derived page).

    Whichever position is MORE RECENT wins. The device record carries the
    time it was written and the server row carries `last_read_at`; when both
    are known and the device's is newer, the exact local page is used even if
    the percentages disagree — the server is simply behind (its save is
    debounced, and a tab closed mid-debounce never flushes). Without
    timestamps the older rule applies: agree within tolerance, or defer to
    the server as the position read further elsewhere. */
export function resolveResumePage(input: ResumeInput): number | null {
  const { local, serverPct, serverAt, isLoggedIn, numPages } = input;
  if (!numPages) return null;
  const p = typeof local?.p === "number" ? Math.floor(local.p) : 0;
  if (p < 1) return null;
  const pct = typeof local?.pct === "number" ? local.pct : 0;
  const localAt = typeof local?.t === "number" ? local.t : null;
  const localIsNewer =
    localAt !== null && typeof serverAt === "number" && localAt > serverAt + CLOCK_SLACK_MS;
  // Clock-free: the server still holds exactly what THIS device last synced,
  // so nothing was read elsewhere since — the device's exact page is newest.
  // (A slow server can stamp `last_read_at` after the device's next write,
  // which the timestamp comparison alone would misread as "server newer".)
  const syncedHere = typeof local?.s === "number" && local.s === serverPct;
  const useLocal =
    !isLoggedIn ||
    serverPct === 0 ||
    localIsNewer ||
    syncedHere ||
    Math.abs(pct - serverPct) <= RESUME_TOLERANCE_PCT;
  if (!useLocal) return null;
  return Math.max(1, Math.min(numPages, p));
}

/** Page implied by a server percentage (the rounded fallback). */
export function pageFromPercent(pct: number, numPages: number): number {
  if (!numPages) return 1;
  return Math.max(1, Math.min(numPages, Math.round((pct / 100) * numPages)));
}

/** The "Welcome back" prompt is only worth showing when the reader is actually
    being moved somewhere — landing on page 1 needs no explanation. */
export function shouldOfferContinue(resumedPage: number): boolean {
  return resumedPage > 1;
}

export function parseLocalPosition(raw: string | null): LocalPosition {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as { p?: unknown; pct?: unknown; t?: unknown; s?: unknown };
    return {
      p: typeof o.p === "number" ? o.p : undefined,
      pct: typeof o.pct === "number" ? o.pct : undefined,
      t: typeof o.t === "number" ? o.t : undefined,
      s: typeof o.s === "number" ? o.s : undefined,
    };
  } catch {
    return null;
  }
}

/** Parse the server's `last_read_at` into ms, or null when absent/invalid. */
export function serverTimestamp(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
