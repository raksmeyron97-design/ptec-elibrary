/* Exact-page resume: which page a returning reader lands on.

   Two sources, with different precision:
     • this device's localStorage holds the EXACT page (and the % it was), but
       knows nothing about other devices;
     • the server holds a rounded PERCENTAGE, synced from every device the
       reader signs in on — and, since migration 0141, the EXACT page too.

   The exact page wins unless the server has clearly moved on — the book was
   read further on another device — in which case the server's position is the
   more recent one and must not be overwritten by a stale local page.

   WHEN THE SERVER WINS, IT NOW WINS PRECISELY. Before 0141 the server held
   only `progress_pct`, so deferring to it meant `pageFromPercent()` — one
   percentage point is five pages of a 500-page book, and a reader continuing
   on their phone landed near, not at, where they stopped on the lab PC. The
   server row now carries `last_page`, and `serverPage()` below prefers it.
   Every input is optional and every path falls back to the old derivation, so
   a row written before 0141 (or by a client that sends no page) resumes
   exactly as it did. */

export type LocalPosition = {
  p?: number;
  pct?: number;
  /** When this device wrote the record (ms). */
  t?: number;
  /** The percentage this device last successfully sent to the server. */
  s?: number;
  /** The account this record belongs to. Undefined on a record written before
      stamping existed — trusted and claimed, exactly as an unstamped bookmark
      record is (`syncReaderBookmarks`). */
  o?: string;
} | null;

export type ResumeInput = {
  local: LocalPosition;
  /** Server progress %, 0 when unknown or logged out. */
  serverPct: number;
  /** Exact page the server holds (0141). Null before that migration, or when
      the row predates it. */
  serverPage?: number | null;
  /** Page count `serverPage` was measured against, so a replaced file of a
      different length is detectable. */
  serverPageCount?: number | null;
  /** When the server position was written (ms since epoch), if known. */
  serverAt?: number | null;
  isLoggedIn: boolean;
  /** The signed-in account, when the surface knows it. Null/undefined on the
      offline reader and the signed-out thesis/publication previews, which
      have no account to disagree with. */
  accountId?: string | null;
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

/** Whether this device's record belongs to a DIFFERENT account than the one
    reading now.

    Only a definite disagreement counts. An unstamped record (`o` undefined)
    predates stamping and is claimed; an unknown reader (`accountId` null — the
    offline reader, a signed-out preview) has no identity to disagree with, so
    those surfaces behave exactly as they always did. */
export function isForeignRecord(
  local: LocalPosition,
  accountId: string | null | undefined,
): boolean {
  return !!local?.o && !!accountId && local.o !== accountId;
}

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
  const { local, serverPct, serverAt, isLoggedIn, accountId, numPages } = input;
  if (!numPages) return null;
  // A device record stamped for ANOTHER account is not this reader's to resume
  // from. localStorage is per-origin and sign-out clears cookies, not storage,
  // so on a shared lab machine this record routinely outlives the reader who
  // wrote it — and every branch below would otherwise hand it to the next one:
  // `serverPct === 0` is exactly the state of someone opening the book for the
  // first time. The stamp must therefore be checked BEFORE any of them.
  // Unstamped records predate stamping and are claimed, the same migration
  // rule `syncReaderBookmarks` applies to an unstamped bookmark record.
  if (isForeignRecord(local, accountId)) return null;
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

/** The exact page the SERVER holds (0141), or null when it cannot be trusted
    and the caller should fall back to `pageFromPercent()`.

    A stored page is only meaningful against the document it was measured in,
    and the file behind a book can be replaced. Two defences, in order:

      • `serverPageCount` known and different from the document now loaded —
        the file changed length, so the page is re-derived proportionally
        rather than used raw. Page 240 of 480 becomes page 6 of 12, not
        "page 240 clamped to 12", which is the end of the book.

      • `serverPageCount` unknown (a row written by a client that sent only a
        page) — the percentage stored alongside it becomes the cross-check.
        The two server values are written together and must agree; when they
        do not, the row is inconsistent and the percentage, which every
        pre-0141 reader already trusted, wins. */
export function serverResumePage(input: ResumeInput): number | null {
  const { serverPage, serverPageCount, serverPct, numPages, isLoggedIn } = input;
  if (!isLoggedIn || !numPages) return null;
  if (typeof serverPage !== "number" || !Number.isFinite(serverPage)) return null;
  const page = Math.floor(serverPage);
  if (page < 1) return null;

  const clamp = (n: number) => Math.max(1, Math.min(numPages, n));

  if (typeof serverPageCount === "number" && serverPageCount > 0) {
    if (serverPageCount === numPages) return clamp(page);
    // Different document length: keep the reader's PLACE, not their index.
    return clamp(Math.round((page / serverPageCount) * numPages));
  }

  // No denominator. Trust the page only where the percentage agrees with it.
  if (page > numPages) return null;
  const impliedPct = Math.round((page / numPages) * 100);
  if (Math.abs(impliedPct - serverPct) > RESUME_TOLERANCE_PCT) return null;
  return clamp(page);
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
    const o = v as { p?: unknown; pct?: unknown; t?: unknown; s?: unknown; o?: unknown };
    return {
      p: typeof o.p === "number" ? o.p : undefined,
      pct: typeof o.pct === "number" ? o.pct : undefined,
      t: typeof o.t === "number" ? o.t : undefined,
      s: typeof o.s === "number" ? o.s : undefined,
      // A non-string stamp is dropped rather than stored: a record that cannot
      // name its owner is treated as unowned, never as owned by something odd.
      o: typeof o.o === "string" ? o.o : undefined,
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
