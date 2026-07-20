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
  /** Inline PDF reading (books/theses/publications) — per IP */
  fileRead: () => ({
    limit: isPdfLimitStrict() ? 10 : envInt("RL_FILE_READ_PER_MIN", 30),
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
} as const;

export type PolicyName = keyof typeof POLICIES;

function strictDiv(limit: number): number {
  return isStrictRateLimit() ? Math.max(1, Math.floor(limit / 3)) : limit;
}

export function ratePolicy(name: PolicyName): RatePolicy {
  return POLICIES[name]();
}
