/**
 * Central rate-limit policy + emergency ("DDoS mode") switches.
 *
 * Every value can be overridden per-deploy with env vars, so limits can be
 * tightened during an attack without a code change (set the var and redeploy —
 * on Vercel this takes ~1 minute). See docs/DDOS-PROTECTION.md for the runbook.
 *
 * Emergency switches (all default OFF; "true" enables):
 *   DDOS_MODE=true                 — master switch: implies all of the below
 *   STRICT_RATE_LIMIT=true         — divide all public limits by 3
 *   DISABLE_EXPENSIVE_SEARCH=true  — skip the Gemini search summary and
 *                                    autocomplete suggestions (plain search
 *                                    keeps working)
 *   PDF_DOWNLOAD_LIMIT_STRICT=true — clamp file/download routes hard
 *
 * NEVER weakened by these switches: admin auth, MFA, ownership checks.
 */

export const isDdosMode = () => process.env.DDOS_MODE === "true";

export const isStrictRateLimit = () =>
  isDdosMode() || process.env.STRICT_RATE_LIMIT === "true";

export const isExpensiveSearchDisabled = () =>
  isDdosMode() || process.env.DISABLE_EXPENSIVE_SEARCH === "true";

export const isPdfLimitStrict = () =>
  isDdosMode() || process.env.PDF_DOWNLOAD_LIMIT_STRICT === "true";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface RatePolicy {
  limit: number;
  windowMs: number;
}

/**
 * Named per-route policies. `strict` values apply when the corresponding
 * emergency switch is on; otherwise limits fall back to env override → default.
 */
const POLICIES = {
  /** AI search (Gemini summary) — per IP */
  search: () => ({
    limit: strictDiv(envInt("RL_SEARCH_PER_MIN", 10)),
    windowMs: 60_000,
  }),
  /** Full-text/native search — per IP */
  searchNative: () => ({
    limit: strictDiv(envInt("RL_SEARCH_NATIVE_PER_MIN", 30)),
    windowMs: 60_000,
  }),
  /** Autocomplete suggestions — per IP */
  suggestions: () => ({
    limit: strictDiv(envInt("RL_SUGGESTIONS_PER_MIN", 60)),
    windowMs: 60_000,
  }),
  /** Opening a PDF for inline reading (books/theses/publications) — per IP */
  fileRead: () => ({
    limit: isPdfLimitStrict() ? 10 : envInt("RL_FILE_READ_PER_MIN", 30),
    windowMs: 60_000,
  }),
  /**
   * Continuing an already-open PDF: a `Range` request for more of a document
   * the caller has already been authorized to read.
   *
   * Separate from `fileRead` because they are different events. pdf.js fetches
   * a book in chunks, so ONE reader opening ONE large book issues many ranged
   * requests — under the 30/min `fileRead` ceiling that reader exceeded their
   * own limit before the first page finished and got a 429 mid-open. Counting
   * every 512 KB of one authorized read as a fresh "file read" measured the
   * wrong thing.
   *
   * It is still a real ceiling, not an exemption: at 512 KB a chunk this
   * allows roughly 120 MB a minute per IP, about two full sequential reads of
   * the largest books in the collection, and it collapses with the others
   * under DDoS/strict mode.
   */
  fileRange: () => ({
    limit: isPdfLimitStrict() ? 40 : envInt("RL_FILE_RANGE_PER_MIN", 240),
    windowMs: 60_000,
  }),
  /** Authenticated book downloads — per user */
  download: () => ({
    limit: isPdfLimitStrict() ? 2 : envInt("RL_DOWNLOAD_PER_MIN", 5),
    windowMs: 60_000,
  }),
  /** Review submissions — per user */
  review: () => ({
    limit: envInt("RL_REVIEWS_PER_10MIN", 5),
    windowMs: 10 * 60_000,
  }),
  /** Note autosaves (1s debounce in the UI) — per user */
  noteSave: () => ({
    limit: envInt("RL_NOTES_PER_MIN", 40),
    windowMs: 60_000,
  }),
  /** Post draft autosaves (2s debounce + 25s interval fallback) — per user */
  postAutosave: () => ({
    limit: envInt("RL_POST_AUTOSAVE_PER_MIN", 40),
    windowMs: 60_000,
  }),
  /** Thesis draft autosaves (2s debounce + 25s interval fallback) — per user */
  thesisAutosave: () => ({
    limit: envInt("RL_THESIS_AUTOSAVE_PER_MIN", 40),
    windowMs: 60_000,
  }),
  /** OAI-PMH harvesting (/api/oai) — per IP. Harvesters page sequentially
   *  (one request per resumptionToken), so 30/min is generous for a
   *  well-behaved BASE/CORE/OpenAIRE crawl while still capping abuse. */
  oai: () => ({
    limit: strictDiv(envInt("RL_OAI_PER_MIN", 30)),
    windowMs: 60_000,
  }),
  /** Metadata export feeds (/api/export) — per IP. Same harvest cadence
   *  assumptions as OAI; responses are also CDN-cached for an hour. */
  export: () => ({
    limit: strictDiv(envInt("RL_EXPORT_PER_MIN", 30)),
    windowMs: 60_000,
  }),
  /** /admin/storage browsing (list/search/metadata) — per admin. Defense in
   *  depth: the storage service rate-limits its own /api/v1 independently. */
  storageBrowse: () => ({
    limit: envInt("RL_STORAGE_BROWSE_PER_MIN", 120),
    windowMs: 60_000,
  }),
  /** /admin/storage uploads — per admin. */
  storageUpload: () => ({
    limit: envInt("RL_STORAGE_UPLOAD_PER_HOUR", 60),
    windowMs: 3600_000,
  }),
  /** /admin/storage mutations (rename/move/copy/trash/restore) — per admin. */
  storageMutate: () => ({
    limit: envInt("RL_STORAGE_MUTATE_PER_HOUR", 120),
    windowMs: 3600_000,
  }),
  /** /admin/storage permanent delete — per admin. Deliberately tight. */
  storagePurge: () => ({
    limit: envInt("RL_STORAGE_PURGE_PER_HOUR", 10),
    windowMs: 3600_000,
  }),
  /**
   * Password sign-in, per client. Added with the server-side login proxy
   * (app/actions/sign-in.ts): before that the login form had NO rate limit of
   * its own — only Turnstile, which a headless client with a solver defeats.
   *
   * 10 per 5 minutes is generous for a person who mistypes and forgiving of a
   * shared campus NAT address, while making an unthrottled guessing run
   * impossible. NEVER weakened by DDOS_MODE/STRICT_RATE_LIMIT — those switches
   * exist to shed public read traffic during an attack, and tightening auth
   * limits during an incident is a decision an operator makes explicitly.
   */
  login: () => ({
    limit: envInt("RL_LOGIN_PER_5MIN", 10),
    windowMs: 5 * 60_000,
  }),
  /**
   * Password sign-in, per ACCOUNT. Stops a distributed run against one
   * mailbox, which the per-client limit cannot see. Keyed on a keyed hash of
   * the address, never the address itself.
   */
  loginAccount: () => ({
    limit: envInt("RL_LOGIN_PER_ACCOUNT_PER_15MIN", 15),
    windowMs: 15 * 60_000,
  }),
  /**
   * Reading-position saves (`POST /api/reader/progress`) — per signed-in user.
   *
   * The reader debounces its autosave at 1.5 s and only writes when the page
   * actually changed, and this endpoint additionally only carries the teardown
   * flush, so a real reading session produces a handful of requests. The
   * ceiling exists so a stuck client cannot hammer a write path; it is well
   * clear of a reader turning pages continuously.
   */
  readerProgress: () => ({
    limit: envInt("RL_READER_PROGRESS_PER_MIN", 60),
    windowMs: 60_000,
  }),
  /** Second-factor verification — per signed-in user, else per client. */
  /**
   * Reader telemetry beacons — per IP, anonymous by necessity (a beacon fires
   * as the document is torn down, and there is no session to key on).
   *
   * A reading session emits a handful: one first-page event, one session
   * summary, and one per failure or outage. 120/min is far above that and far
   * below anything that could be used to write rows in volume; over the limit
   * the event is dropped with a 204, never a 429 — a beacon cannot read a
   * reply and must not retry.
   */
  readerEvents: () => ({
    limit: strictDiv(envInt("RL_READER_EVENTS_PER_MIN", 120)),
    windowMs: 60_000,
  }),
  mfaVerify: () => ({
    limit: envInt("RL_MFA_VERIFY_PER_5MIN", 10),
    windowMs: 5 * 60_000,
  }),
} as const;

export type PolicyName = keyof typeof POLICIES;

function strictDiv(limit: number): number {
  return isStrictRateLimit() ? Math.max(1, Math.floor(limit / 3)) : limit;
}

export function ratePolicy(name: PolicyName): RatePolicy {
  return POLICIES[name]();
}
