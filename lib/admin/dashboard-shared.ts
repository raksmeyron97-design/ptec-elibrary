// Shared, client-safe dashboard primitives: view/filter vocabulary, URL
// parsing/serialisation, and the pure metric math (period comparisons,
// funnel steps, unique-visitor deduplication). No server imports — both the
// server loaders (lib/admin/dashboard*.ts) and client toolbar components
// consume this module, and everything here is unit-testable.

// ── Views ────────────────────────────────────────────────────────────────────

export const DASHBOARD_VIEWS = ["overview", "content", "search", "audience", "system"] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

// ── Ranges (same vocabulary the 2026-07-08 dashboard shipped with) ──────────

export type DashboardRange = "today" | "7d" | "30d" | "90d" | "custom";
export const DASHBOARD_RANGES: DashboardRange[] = ["today", "7d", "30d", "90d", "custom"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_DAYS = 365;
const ONE_DAY = 86_400_000;

// ── Content-type / language filters ─────────────────────────────────────────

export const CONTENT_TYPE_FILTERS = ["all", "book", "research_report", "publication", "post"] as const;
export type ContentTypeFilter = (typeof CONTENT_TYPE_FILTERS)[number];

export const LANGUAGE_FILTERS = ["all", "en", "km"] as const;
export type LanguageFilter = (typeof LANGUAGE_FILTERS)[number];

export type DashboardFilters = {
  view: DashboardView;
  range: DashboardRange;
  /** Inclusive "YYYY-MM-DD" bounds, only when range === "custom". */
  from?: string;
  to?: string;
  /** Previous-period comparison on/off (default on). */
  compare: boolean;
  type: ContentTypeFilter;
  /** Department display name (books/theses), or null for all. */
  dept: string | null;
  lang: LanguageFilter;
};

export const DEFAULT_FILTERS: DashboardFilters = {
  view: "overview",
  range: "30d",
  compare: true,
  type: "all",
  dept: null,
  lang: "all",
};

function todayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Validate raw URL search params into a safe filter set. Anything invalid
 * falls back to the default for that field rather than erroring — bad dates,
 * from > to, spans over 365 days, unknown enum values, oversized dept names.
 */
export function parseDashboardFilters(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): DashboardFilters {
  const get = (key: string): string | null => {
    const v = params[key];
    return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? null) : null;
  };

  const view = (DASHBOARD_VIEWS as readonly string[]).includes(get("view") ?? "")
    ? (get("view") as DashboardView)
    : "overview";

  let range: DashboardRange = "30d";
  let from: string | undefined;
  let to: string | undefined;
  const rawRange = get("range") ?? "30d";
  if (rawRange !== "custom" && DASHBOARD_RANGES.includes(rawRange as DashboardRange)) {
    range = rawRange as DashboardRange;
  } else if (rawRange === "custom") {
    const f = get("from");
    const t = get("to");
    if (f && t && DATE_RE.test(f) && DATE_RE.test(t)) {
      const fromMs = Date.parse(`${f}T00:00:00Z`);
      const toMs = Date.parse(`${t}T00:00:00Z`);
      const valid =
        !Number.isNaN(fromMs) &&
        !Number.isNaN(toMs) &&
        fromMs <= toMs &&
        (toMs - fromMs) / ONE_DAY < MAX_CUSTOM_DAYS &&
        f <= todayKey(now);
      if (valid) {
        range = "custom";
        from = f;
        to = t;
      }
    }
  }

  const type = (CONTENT_TYPE_FILTERS as readonly string[]).includes(get("type") ?? "")
    ? (get("type") as ContentTypeFilter)
    : "all";
  const lang = (LANGUAGE_FILTERS as readonly string[]).includes(get("lang") ?? "")
    ? (get("lang") as LanguageFilter)
    : "all";

  // Departments are stored display names (often Khmer text). Cap length and
  // strip control characters; the loader matches against the real list.
  const rawDept = get("dept");
  const dept = rawDept ? rawDept.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80) || null : null;

  return {
    view,
    range,
    from,
    to,
    compare: get("compare") !== "0",
    type,
    dept,
    lang,
  };
}

/** Serialise filters back to a query string, omitting defaults. */
export function serializeDashboardFilters(f: DashboardFilters): string {
  const sp = new URLSearchParams();
  if (f.view !== "overview") sp.set("view", f.view);
  if (f.range !== "30d") sp.set("range", f.range);
  if (f.range === "custom" && f.from && f.to) {
    sp.set("from", f.from);
    sp.set("to", f.to);
  }
  if (!f.compare) sp.set("compare", "0");
  if (f.type !== "all") sp.set("type", f.type);
  if (f.dept) sp.set("dept", f.dept);
  if (f.lang !== "all") sp.set("lang", f.lang);
  return sp.toString();
}

/** Count of non-default audience filters (type/dept/lang) for the toolbar chip. */
export function activeFilterCount(f: DashboardFilters): number {
  let n = 0;
  if (f.type !== "all") n++;
  if (f.dept) n++;
  if (f.lang !== "all") n++;
  return n;
}

// ── Period comparison ────────────────────────────────────────────────────────

export type TrendInfo = {
  direction: "up" | "down" | "neutral";
  /** Short badge text, e.g. "+18%", "-2", "New". */
  value: string;
  /** Context line, e.g. "vs previous 30 days", "no previous data". */
  label: string;
  /** Absolute previous-period value, so small baselines are never hidden. */
  previous?: number;
  /**
   * How the UI should present the comparison:
   *  - "hidden"   — previous period is 0, so any delta is meaningless; render
   *                 no comparison chip at all.
   *  - "absolute" — previous base is too small for an honest percentage;
   *                 render the absolute delta in muted text ("+143 · 53
   *                 previously"), never coloured up/down drama.
   *  - "percent"  — normal coloured percentage chip.
   */
  mode: "hidden" | "absolute" | "percent";
};

/**
 * Percent (or absolute for tiny bases) change vs the previous period.
 * Percentages mislead on small bases (1 → 3 is "+200%"), so below
 * `minPercentBase` the badge shows the absolute difference instead, and the
 * previous value is always carried so the UI can say "335 vs 12 previously".
 * When the previous period is 0 there is nothing to compare against, so the
 * result is marked `mode: "hidden"` and the UI suppresses the chip entirely.
 */
export function compareTrend(
  current: number,
  previous: number,
  vsLabel: string,
  minPercentBase = 20,
): TrendInfo {
  if (previous === 0 && current === 0) {
    return { direction: "neutral", value: "—", label: "no previous data", previous, mode: "hidden" };
  }
  if (previous === 0) {
    return { direction: "up", value: "New", label: `new activity ${vsLabel}`, previous, mode: "hidden" };
  }
  const mode = previous < minPercentBase ? "absolute" : "percent";
  const diff = current - previous;
  if (diff === 0) {
    return { direction: "neutral", value: "±0", label: vsLabel, previous, mode };
  }
  const value =
    mode === "absolute"
      ? `${diff > 0 ? "+" : ""}${diff}`
      : `${diff > 0 ? "+" : ""}${Math.round((diff / previous) * 100)}%`;
  return { direction: diff > 0 ? "up" : "down", value, label: vsLabel, previous, mode };
}

// ── Unique-visitor deduplication ─────────────────────────────────────────────

export type VisitorRow = {
  userId: string | null;
  sessionHash: string | null;
};

/**
 * Count distinct visitors from event rows. Signed-in users deduplicate on
 * user id (stable across days); anonymous visitors deduplicate on the
 * daily-rotating session hash, so one anonymous person active on N days
 * counts N times — that is the deliberate privacy trade-off and the UI
 * definition says so. Rows with neither identifier (historical data from
 * before instrumentation) are excluded and reported via `untracked`.
 */
export function uniqueVisitors(rows: VisitorRow[]): { visitors: number; untracked: number } {
  const seen = new Set<string>();
  let untracked = 0;
  for (const r of rows) {
    if (r.userId) seen.add(`u:${r.userId}`);
    else if (r.sessionHash) seen.add(`s:${r.sessionHash}`);
    else untracked++;
  }
  return { visitors: seen.size, untracked };
}

// ── Discovery & engagement rates ────────────────────────────────────────────
//
// The event streams (searches, result clicks, detail views, reader opens,
// downloads/saves) are independent volumes — visitors also arrive via direct
// links, so they must NOT be presented as a sequential funnel. These are the
// honest aggregate ratios between comparable pairs.

export type DiscoveryVolumes = {
  searches: number;
  resultClicks: number;
  detailViews: number;
  /** null while the reader-open instrumentation is still collecting. */
  readerOpens: number | null;
  downloadsOrSaves: number;
};

export type DiscoveryRate = {
  /** Percent 0–100+, or null when the denominator is 0 / stage collecting. */
  pct: number | null;
  /** False when the ratio exceeds 100% — populations aren't comparable yet
   *  (e.g. downloads recorded before view instrumentation covered everyone).
   *  The UI shows an explanatory dash instead of a percentage. */
  comparable: boolean;
};

export type DiscoveryRates = {
  /** result clicks ÷ searches */
  searchCtr: DiscoveryRate;
  /** reader opens ÷ detail views */
  readRate: DiscoveryRate;
  /** downloads-or-saves ÷ detail views */
  downloadRate: DiscoveryRate;
};

function rate(numerator: number | null, denominator: number): DiscoveryRate {
  if (numerator === null || denominator <= 0) return { pct: null, comparable: false };
  const p = Math.round((numerator / denominator) * 1000) / 10;
  return { pct: p, comparable: p <= 100 };
}

export function discoveryRates(v: DiscoveryVolumes): DiscoveryRates {
  return {
    searchCtr: rate(v.resultClicks, v.searches),
    readRate: rate(v.readerOpens, v.detailViews),
    downloadRate: rate(v.downloadsOrSaves, v.detailViews),
  };
}

// ── Test/automation query detection ─────────────────────────────────────────

const TEST_QUERY_RE = /(?:z{3,}|x{4,}|bugcheck|lorem ipsum|asdf|qwert)/i;

/**
 * Deterministic heuristic for search terms that look like testing or pasted
 * artifacts rather than real collection demand: keyboard mash / sentinel
 * strings, very long pasted passages, or 8+ word sentences. Flagged terms
 * are *labelled* in the query table and excluded from collection
 * opportunities — never silently deleted from raw analytics.
 */
export function isLikelyTestQuery(term: string): boolean {
  const t = term.trim();
  if (t.length === 0) return false;
  if (t.length > 64) return true;
  if (TEST_QUERY_RE.test(t)) return true;
  const words = t.split(/\s+/).length;
  return words >= 8;
}

// ── Internal-traffic exclusion ───────────────────────────────────────────────

/**
 * Dashboard engagement analytics exclude events generated by admin-panel
 * staff accounts (verified 2026-07-12: 58% of hosted view events were staff
 * browsing). Raw logs keep everything — the exclusion happens at read time
 * so it is reversible and documented (docs/DASHBOARD-METRICS.md).
 */
export function excludeInternal<T extends { userId: string | null }>(
  rows: T[],
  internalIds: ReadonlySet<string>,
): T[] {
  if (internalIds.size === 0) return rows;
  return rows.filter((r) => !r.userId || !internalIds.has(r.userId));
}

// ── Admin-activity label keys ────────────────────────────────────────────────

const KNOWN_ADMIN_ACTIONS = new Set([
  "dashboard.export",
  "user.invite",
  "user.delete",
  "user.suspend",
  "user_password.reset_sent",
  "user_subscription.assign",
  "user_role.update",
  "book.create",
  "book.update",
  "book.delete",
  "publication.create",
  "publication.update",
  "post.create",
  "post.update",
  "content.approve",
]);

/**
 * Maps a machine audit action ("user_password.reset_sent") to an i18n key
 * under adminDashboard.system.activity.*, or null when unknown (the UI then
 * falls back to a generic humanised form and keeps the machine name in the
 * details tooltip).
 */
export function adminActionLabelKey(action: string): string | null {
  const a = action.toLowerCase().trim();
  return KNOWN_ADMIN_ACTIONS.has(a) ? a.replace(/\./g, "_") : null;
}

// ── Admin-activity grouping ──────────────────────────────────────────────────

const ACTIVITY_GROUP_WINDOW_MS = 15 * 60_000;

export type ActivityGroup<T> = {
  /** Representative (most recent) entry of the run. */
  head: T;
  /** All entries in the run, newest first (length 1 = not grouped). */
  entries: T[];
};

/**
 * Collapses consecutive identical actions by the same actor into one group
 * when each entry follows the previous within `windowMs` (bulk operations
 * like "retired 3 duplicate books" otherwise flood the timeline). Input must
 * be sorted newest-first — the order the audit query returns.
 */
export function groupConsecutiveActivity<T extends { action: string; actor: string; createdAt: string }>(
  rows: T[],
  windowMs = ACTIVITY_GROUP_WINDOW_MS,
): ActivityGroup<T>[] {
  const groups: ActivityGroup<T>[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    const prevEntry = last?.entries[last.entries.length - 1];
    if (
      prevEntry &&
      prevEntry.action === row.action &&
      prevEntry.actor === row.actor &&
      new Date(prevEntry.createdAt).getTime() - new Date(row.createdAt).getTime() <= windowMs
    ) {
      last.entries.push(row);
    } else {
      groups.push({ head: row, entries: [row] });
    }
  }
  return groups;
}

const SENSITIVE_ACTION_RE = /reveal|password|contact/;
const SENSITIVE_ACTIONS = new Set(["user.delete", "user.suspend", "user.invite"]);

/**
 * Actions that touch personal data (revealing reader contacts, password
 * resets, account suspension/deletion) get a shield marker in activity
 * timelines so privacy-relevant operations stay visible at a glance.
 */
export function isSensitiveAdminAction(action: string): boolean {
  const a = action.toLowerCase().trim();
  return SENSITIVE_ACTION_RE.test(a) || SENSITIVE_ACTIONS.has(a);
}

// ── Ratio helpers ────────────────────────────────────────────────────────────

/** Safe percentage (0–100, one decimal) — null when the denominator is 0. */
export function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Per-resource normalisation — null when the resource count is 0. */
export function perResource(total: number, resources: number): number | null {
  if (resources <= 0) return null;
  return Math.round((total / resources) * 10) / 10;
}
