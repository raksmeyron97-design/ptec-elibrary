// The retired-URL queue audit (migrations 0170/0171, SEO audit 2026-10 WI-1).
//
// Pure: scripts/audit-retired-urls.ts collects the evidence (read-only GETs)
// and hands it here; everything that decides what a record's state IS lives
// in this file, so the rules are unit-testable with no network.
//
// ── The defect this exists to prevent ────────────────────────────────────────
//
// "The suggested target answers 200" says nothing about the dead URL. A
// source is resolved only when the SOURCE itself was asked, answered with a
// permanent redirect (or an approved 410), the chain was followed hop by hop,
// AND the destination is supportable as the same work. Each of those is a
// separate field below and none is inferred from another:
//
//   observed     what production answered, per locale, hop by hop
//   decision     what the database records (queue resolution, redirect row)
//   approval     whether a PERSON made that decision (never who — no ids)
//   semantic     whether the destination is shown to be the same work
//
// Two rules are deliberate and easy to undo by accident:
//   * a queue decision records THAT someone pressed Redirect, not WHY — so it
//     is `approval`, never `semantic`. Semantic support comes only from the
//     same record (a rename the trigger captured, a book_slug_redirects alias)
//     or an explicit reviewer confirmation (docs/seo/retired-url-confirmations.json).
//   * a suggested successor is a candidate. Its HTTP 200 makes it AVAILABLE,
//     never equivalent.

import { resolveUrlRedirect } from "@/lib/url-redirect-gate";
import { parseTarget } from "@/lib/url-redirects/queue";

// ── Policy ──────────────────────────────────────────────────────────────────

/** The edge collapses chains (upsert_url_redirect), so a correct redirect is ONE hop. */
export const ALLOWED_REDIRECT_HOPS = 1;
/** How far the collector follows before giving up — beyond policy, to SEE a chain. */
export const FOLLOW_LIMIT = 5;

const PERMANENT = new Set([301, 308]);
const REDIRECT = new Set([301, 302, 303, 307, 308]);

// ── Input evidence ──────────────────────────────────────────────────────────

/** One response, as observed with `redirect: "manual"`. `location` is the raw header. */
export type Hop = { url: string; status: number; location: string | null; robots: string | null };

/**
 * One locale's request chain. `answered` means every hop got a response;
 * `stop` says why following ended. `no_answer` is transport failure or a
 * persisting 5xx/429 at some hop — the hops before it are kept.
 */
export type ChainProbe =
  | { kind: "answered"; hops: Hop[]; stop: "final" | "loop" | "follow_limit" | "off_site"; canonical: string | null }
  | { kind: "no_answer"; hops: Hop[]; detail: string };

export type QueueState = {
  resolution: "pending" | "redirected" | "gone" | "ignored";
  suggestedPath: string | null;
  cause: string;
  /** resolved_by is set — a person decided. The id itself never leaves the collector. */
  decidedByPerson: boolean;
  deciderRole: string | null;
  resolvedAt: string | null;
};

export type RedirectRow = {
  targetPath: string | null;
  status: number;
  /** created_by is set (queue action) vs null (a trigger captured a rename). `null` = not readable. */
  decidedByPerson: boolean | null;
};

export type Confirmation = {
  path: string;
  target: string;
  verdict: "supported" | "incorrect";
  basis: string;
  confirmedBy: string;
  confirmedAt: string;
};

/** "unavailable" = the read failed or the key could not see it — never "absent". */
type Maybe<T> = T | null | "unavailable";

export type RecordEvidence = {
  path: string;
  seededSuggestion: string | null;
  queue: QueueState | "missing" | "unavailable";
  redirectRow: Maybe<RedirectRow>;
  /** book_slug_redirects alias whose book is published: the book gate answers it. */
  alias: Maybe<{ targetPath: string }>;
  probes: { en: ChainProbe | null; km: ChainProbe | null };
  /** The suggested successor, checked separately from the source (English only). */
  target: { path: string; probe: ChainProbe | null } | null;
  confirmation: Confirmation | null;
};

// ── Chain analysis ──────────────────────────────────────────────────────────

/** Decoded, locale-less pathname of an absolute URL; trailing slash dropped. */
export function sitePath(url: string, localePrefix: "" | "/km"): { path: string; localeKept: boolean } {
  const u = new URL(url);
  let path = u.pathname
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join("/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!localePrefix) return { path, localeKept: !path.startsWith("/km/") && path !== "/km" };
  if (path === localePrefix) return { path: "/", localeKept: true };
  if (path.startsWith(`${localePrefix}/`)) return { path: path.slice(localePrefix.length), localeKept: true };
  return { path, localeKept: false };
}

export type LocaleOutcome =
  | { kind: "not_probed" }
  | { kind: "no_answer"; detail: string }
  | { kind: "live" }
  | { kind: "not_found" }
  | { kind: "gone"; noindex: boolean }
  | { kind: "other"; status: number }
  | {
      kind: "redirect";
      defects: string[];
      redirects: number;
      firstStatus: number;
      finalPath: string | null;
      finalStatus: number | null;
    };

export function analyseChain(probe: ChainProbe | null, localePrefix: "" | "/km"): LocaleOutcome {
  if (!probe) return { kind: "not_probed" };
  if (probe.kind === "no_answer") return { kind: "no_answer", detail: probe.detail };
  const [first] = probe.hops;
  if (!first) return { kind: "no_answer", detail: "no response recorded" };

  if (!REDIRECT.has(first.status)) {
    if (first.status === 200) return { kind: "live" };
    if (first.status === 404) return { kind: "not_found" };
    if (first.status === 410) return { kind: "gone", noindex: /noindex/i.test(first.robots ?? "") };
    return { kind: "other", status: first.status };
  }

  const defects: string[] = [];
  const redirects = probe.hops.filter((h) => REDIRECT.has(h.status)).length;
  if (probe.hops.some((h) => REDIRECT.has(h.status) && !PERMANENT.has(h.status))) defects.push("temporary_redirect");
  if (probe.stop === "loop") defects.push("loop");
  if (probe.stop === "follow_limit") defects.push("follow_limit");
  if (probe.stop === "off_site") defects.push("off_site");
  if (redirects > ALLOWED_REDIRECT_HOPS) defects.push(`hops_${redirects}_over_${ALLOWED_REDIRECT_HOPS}`);

  const last = probe.hops[probe.hops.length - 1];
  let finalPath: string | null = null;
  let finalStatus: number | null = null;
  if (probe.stop === "final") {
    finalStatus = last.status;
    const { path, localeKept } = sitePath(last.url, localePrefix);
    finalPath = path;
    if (!localeKept) defects.push("locale_dropped");
    if (last.status !== 200) defects.push(`final_status_${last.status}`);
  }
  return { kind: "redirect", defects, redirects, firstStatus: first.status, finalPath, finalStatus };
}

// ── Classification ──────────────────────────────────────────────────────────

export const CLASSIFICATIONS = [
  "RESOLVED_REDIRECT",
  "RESOLVED_RETIRED",
  "SOURCE_REDIRECTS_TARGET_UNVERIFIED",
  "BROKEN_REDIRECT",
  "DECISION_NOT_EFFECTIVE",
  "TARGET_AVAILABLE_SOURCE_UNRESOLVED",
  "SOURCE_404_REVIEW_REQUIRED",
  "NO_SUCCESSOR_REVIEW_REQUIRED",
  "SOURCE_404_IGNORED",
  "SOURCE_410_UNAPPROVED",
  "SOURCE_LIVE",
  "NOT_VERIFIED",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const RESOLVED: ReadonlySet<Classification> = new Set(["RESOLVED_REDIRECT", "RESOLVED_RETIRED"]);

export type Semantic = "SUPPORTED" | "INCORRECT" | "UNVERIFIED" | "NOT_APPLICABLE";
export type Approval = "PERSON_DECISION" | "AUTOMATIC_RENAME" | "ALIAS" | "NONE" | "UNKNOWN";
export type Reviewer = "none" | "librarian" | "owner_or_librarian" | "engineer";

export type Verdict = {
  classification: Classification;
  semantic: Semantic;
  semanticBasis: string;
  approval: Approval;
  /** Where the observed redirect lands, if it does (locale-less). */
  observedTarget: string | null;
  /** The successor the database records for this path, if any. */
  recordedTarget: string | null;
  /** The suggestion a reviewer would act on (queue, else seed), if any. */
  suggestion: string | null;
  suggestionSource: "queue" | "seed" | null;
  /** Suggestion refused by the queue's own target rule (parseTarget). */
  suggestionUnsafe: boolean;
  targetAvailable: boolean | null;
  discrepancies: string[];
  reasons: string[];
  action: string;
  reviewer: Reviewer;
};

function suggestionOf(ev: RecordEvidence): { path: string | null; source: "queue" | "seed" | null } {
  if (ev.queue !== "missing" && ev.queue !== "unavailable") {
    return ev.queue.suggestedPath ? { path: ev.queue.suggestedPath, source: "queue" } : { path: null, source: null };
  }
  return ev.seededSuggestion ? { path: ev.seededSuggestion, source: "seed" } : { path: null, source: null };
}

function recordedTargetOf(ev: RecordEvidence): string | null {
  if (ev.redirectRow && ev.redirectRow !== "unavailable" && ev.redirectRow.status === 301) return ev.redirectRow.targetPath;
  if (ev.alias && ev.alias !== "unavailable") return ev.alias.targetPath;
  return null;
}

function approvalOf(ev: RecordEvidence): Approval {
  if (ev.redirectRow === "unavailable" || ev.queue === "unavailable") return "UNKNOWN";
  if (ev.redirectRow) {
    if (ev.redirectRow.decidedByPerson === true) return "PERSON_DECISION";
    if (ev.redirectRow.decidedByPerson === false) return "AUTOMATIC_RENAME";
    return "UNKNOWN";
  }
  if (ev.alias && ev.alias !== "unavailable") return "ALIAS";
  if (ev.queue !== "missing" && ev.queue.decidedByPerson && ev.queue.resolution !== "pending") return "PERSON_DECISION";
  return "NONE";
}

/**
 * Is `target` shown to be the same work as `path`? Never from HTTP, never
 * from a title. Same record (a captured rename or an alias) or an explicit
 * reviewer confirmation naming exactly this pair.
 */
function semanticOf(ev: RecordEvidence, target: string | null, approval: Approval): { semantic: Semantic; basis: string } {
  if (!target) return { semantic: "NOT_APPLICABLE", basis: "no destination" };
  const c = ev.confirmation;
  if (c && c.path === ev.path && c.target === target) {
    return c.verdict === "supported"
      ? { semantic: "SUPPORTED", basis: `reviewer confirmation (${c.basis}, ${c.confirmedBy}, ${c.confirmedAt})` }
      : { semantic: "INCORRECT", basis: `reviewer marked incorrect (${c.basis}, ${c.confirmedBy}, ${c.confirmedAt})` };
  }
  if (approval === "AUTOMATIC_RENAME") return { semantic: "SUPPORTED", basis: "same record: rename captured by trigger" };
  if (approval === "ALIAS") return { semantic: "SUPPORTED", basis: "book_slug_redirects alias of the destination record" };
  if (approval === "PERSON_DECISION") {
    return { semantic: "UNVERIFIED", basis: "a person pressed Redirect; the queue records no bibliographic basis" };
  }
  return { semantic: "UNVERIFIED", basis: "suggestion only — HTTP availability is not equivalence" };
}

const ACTIONS: Record<Classification, { reviewer: Reviewer; action: string }> = {
  RESOLVED_REDIRECT: { reviewer: "none", action: "None. Re-run this audit after any change to the path or its target." },
  RESOLVED_RETIRED: { reviewer: "none", action: "None. Re-run this audit after any change to the path." },
  SOURCE_REDIRECTS_TARGET_UNVERIFIED: {
    reviewer: "owner_or_librarian",
    action:
      "Confirm the destination is the same work or its approved replacement and record it in docs/seo/retired-url-confirmations.json; if it is not, replace the redirect from /admin/books/retired-urls.",
  },
  BROKEN_REDIRECT: { reviewer: "engineer", action: "Fix the redirect defect named in the reasons, then re-run this audit." },
  DECISION_NOT_EFFECTIVE: {
    reviewer: "engineer",
    action: "The database records a decision production does not serve: check URL_REDIRECTS, the edge snapshot (120 s) and the deployed build.",
  },
  TARGET_AVAILABLE_SOURCE_UNRESOLVED: {
    reviewer: "librarian",
    action:
      "Open both records; if the suggestion is the same work (or its replacement edition), press Redirect in /admin/books/retired-urls. Otherwise choose another successor, 410, or Ignore.",
  },
  SOURCE_404_REVIEW_REQUIRED: {
    reviewer: "librarian",
    action: "The stored suggestion is not usable (see reasons). Choose another successor, 410 if removed deliberately, or Ignore.",
  },
  NO_SUCCESSOR_REVIEW_REQUIRED: {
    reviewer: "librarian",
    action: "Decide: a successor (the queue page lists candidates), 410 if the work was removed deliberately, or Ignore.",
  },
  SOURCE_404_IGNORED: {
    reviewer: "owner_or_librarian",
    action: "A person chose Ignore, so the URL stays 404. Confirm that is intended; otherwise 410 or a 301.",
  },
  SOURCE_410_UNAPPROVED: {
    reviewer: "engineer",
    action: "The 410 is not backed by an approved decision (or lacks noindex). Find what serves it before treating it as a retirement.",
  },
  SOURCE_LIVE: {
    reviewer: "librarian",
    action: "A page answers here again. Confirm it is the intended work; the queue row should have cleared itself (0170 trigger).",
  },
  NOT_VERIFIED: { reviewer: "engineer", action: "Re-run this audit; the evidence named in the reasons was not obtained." },
};

function verdict(
  ev: RecordEvidence,
  classification: Classification,
  parts: Omit<Verdict, "classification" | "action" | "reviewer">,
): Verdict {
  return { classification, ...parts, ...ACTIONS[classification] };
}

export function classifyRecord(ev: RecordEvidence): Verdict {
  const en = analyseChain(ev.probes.en, "");
  const km = analyseChain(ev.probes.km, "/km");
  const reasons: string[] = [];
  const discrepancies: string[] = [];

  const sug = suggestionOf(ev);
  const suggestionUnsafe = sug.path !== null && parseTarget(sug.path) === null;
  const recordedTarget = recordedTargetOf(ev);
  const approval = approvalOf(ev);

  let targetAvailable: boolean | null = null;
  if (sug.path && !suggestionUnsafe && ev.target?.path === sug.path) {
    const t = analyseChain(ev.target.probe, "");
    targetAvailable = t.kind === "live" ? true : t.kind === "no_answer" || t.kind === "not_probed" ? null : false;
    if (targetAvailable === false) reasons.push(`suggested target answers ${describe(t)}`);
    if (targetAvailable === null) reasons.push("suggested target could not be checked");
  }
  if (suggestionUnsafe) reasons.push(`suggested target ${sug.path} is refused by the queue's target rule`);

  // The edge follows a row only through resolveUrlRedirect's shape rule; a row
  // it would refuse is a decision production can never serve.
  if (ev.redirectRow && ev.redirectRow !== "unavailable") {
    const row = { old_path: ev.path, target_path: ev.redirectRow.targetPath, status: ev.redirectRow.status };
    if (resolveUrlRedirect(ev.path, new Map([[ev.path, row]])).kind === "none") {
      discrepancies.push("url_redirects row is refused by the edge gate's shape rule");
    }
  }
  if (ev.queue === "missing") discrepancies.push("not in retired_url_queue (original seeded row is gone)");
  if (ev.queue === "unavailable") discrepancies.push("retired_url_queue not readable");

  const base = {
    semantic: "NOT_APPLICABLE" as Semantic,
    semanticBasis: "no destination",
    approval,
    observedTarget: null as string | null,
    recordedTarget,
    suggestion: sug.path,
    suggestionSource: sug.source,
    suggestionUnsafe,
    targetAvailable,
    discrepancies,
    reasons,
  };

  // 1. No conclusive answer for either locale: nothing may be concluded.
  for (const [label, o] of [["en", en], ["km", km]] as const) {
    if (o.kind === "not_probed") reasons.push(`${label}: source not requested`);
    if (o.kind === "no_answer") reasons.push(`${label}: no answer — ${o.detail}`);
    if (o.kind === "other") reasons.push(`${label}: unexpected status ${o.status}`);
  }
  if ([en, km].some((o) => o.kind === "not_probed" || o.kind === "no_answer" || o.kind === "other")) {
    return verdict(ev, "NOT_VERIFIED", base);
  }

  // 2. The locales must agree on what kind of answer this is.
  if (en.kind !== km.kind) {
    reasons.push(`locales disagree: en ${describe(en)}, km ${describe(km)}`);
    return verdict(ev, "BROKEN_REDIRECT", base);
  }

  if (en.kind === "redirect" && km.kind === "redirect") {
    const defects = [...en.defects.map((d) => `en:${d}`), ...km.defects.map((d) => `km:${d}`)];
    const observedTarget = en.finalPath;
    if (en.finalPath !== km.finalPath) defects.push(`locales land on different paths (${en.finalPath} vs ${km.finalPath})`);
    const sem = semanticOf(ev, observedTarget, approval);
    const parts = { ...base, observedTarget, semantic: sem.semantic, semanticBasis: sem.basis };
    if (sem.semantic === "INCORRECT") defects.push("destination marked semantically incorrect by a reviewer");
    if (defects.length) {
      reasons.push(...defects);
      return verdict(ev, "BROKEN_REDIRECT", parts);
    }
    if (recordedTarget === null) discrepancies.push("production redirects but no url_redirects row or alias records it");
    else if (recordedTarget !== observedTarget) {
      discrepancies.push(`production lands on ${observedTarget}, the database records ${recordedTarget}`);
      return verdict(ev, "SOURCE_REDIRECTS_TARGET_UNVERIFIED", parts);
    }
    if (sem.semantic === "SUPPORTED") return verdict(ev, "RESOLVED_REDIRECT", parts);
    reasons.push(`semantic: ${sem.basis}`);
    return verdict(ev, "SOURCE_REDIRECTS_TARGET_UNVERIFIED", parts);
  }

  if (en.kind === "gone" && km.kind === "gone") {
    const row = ev.redirectRow;
    const approvedRow = row && row !== "unavailable" && row.status === 410 && row.decidedByPerson === true;
    const queueGone = ev.queue !== "missing" && ev.queue !== "unavailable" && ev.queue.resolution === "gone";
    if (!(en.noindex && km.noindex)) reasons.push("410 without x-robots-tag: noindex");
    if (!approvedRow) reasons.push("no url_redirects 410 row decided by a person");
    if (!queueGone) reasons.push("queue does not record resolution 'gone'");
    if (approvedRow && queueGone && en.noindex && km.noindex) {
      if (sug.path) reasons.push(`a successor was suggested (${sug.path}); confirm 410 was chosen over it`);
      return verdict(ev, "RESOLVED_RETIRED", { ...base, approval: "PERSON_DECISION" });
    }
    return verdict(ev, "SOURCE_410_UNAPPROVED", base);
  }

  if (en.kind === "live") return verdict(ev, "SOURCE_LIVE", base);

  // Both locales answer 404 from here on.
  const row = ev.redirectRow;
  if ((row && row !== "unavailable") || (ev.alias && ev.alias !== "unavailable")) {
    reasons.push("the database records a redirect or 410 for this path, production answers 404");
    return verdict(ev, "DECISION_NOT_EFFECTIVE", base);
  }
  if (ev.queue !== "missing" && ev.queue !== "unavailable" && ev.queue.resolution === "ignored") {
    return verdict(ev, "SOURCE_404_IGNORED", base);
  }
  if (ev.queue !== "missing" && ev.queue !== "unavailable" && ev.queue.resolution !== "pending") {
    discrepancies.push(`queue says '${ev.queue.resolution}', production answers 404`);
    return verdict(ev, "DECISION_NOT_EFFECTIVE", base);
  }
  if (!sug.path) return verdict(ev, "NO_SUCCESSOR_REVIEW_REQUIRED", base);
  const sem = semanticOf(ev, sug.path, "NONE");
  const withSem = { ...base, semantic: sem.semantic, semanticBasis: sem.basis };
  if (targetAvailable === true) return verdict(ev, "TARGET_AVAILABLE_SOURCE_UNRESOLVED", withSem);
  if (targetAvailable === null && !suggestionUnsafe) return verdict(ev, "NOT_VERIFIED", withSem);
  return verdict(ev, "SOURCE_404_REVIEW_REQUIRED", withSem);
}

function describe(o: LocaleOutcome): string {
  switch (o.kind) {
    case "redirect":
      return `${o.firstStatus} → ${o.finalPath ?? "?"} (${o.finalStatus ?? "?"})`;
    case "gone":
      return "410";
    case "not_found":
      return "404";
    case "live":
      return "200";
    case "other":
      return String(o.status);
    case "no_answer":
      return "no answer";
    default:
      return "not requested";
  }
}

export { describe as describeOutcome };

// ── The original population ─────────────────────────────────────────────────

export type SeedRow = { path: string; suggested: string | null; note: string };

/** The VALUES tuples of 0171, in order — duplicates kept, so the caller can count them. */
export function parseSeedRows(sql: string): SeedRow[] {
  const start = sql.indexOf("with seed");
  const end = sql.indexOf("),\njudged");
  if (start < 0 || end < 0) throw new Error("0171: seed VALUES list not found");
  const body = sql.slice(start, end);
  return [...body.matchAll(/\(\s*'([^']+)',\s*(null|'([^']+)'),\s*'((?:[^']|'')*)'\s*\)/g)].map((m) => ({
    path: m[1],
    suggested: m[3] ?? null,
    note: m[4].replace(/''/g, "'"),
  }));
}

// ── Reconciliation ──────────────────────────────────────────────────────────

export type AuditedRecord = { id: string; path: string; evidence: RecordEvidence; verdict: Verdict };

export type Reconciliation = {
  seedEntries: number;
  duplicateSeedEntries: string[];
  originalRecords: number;
  foundInQueue: number | null;
  missingFromQueue: string[];
  withSuggestion: number;
  withoutSuggestion: number;
  sourceChecks: number;
  sourceChecksAnswered: number;
  redirectHopsObserved: number;
  targetChecks: number;
  observed404: number;
  observed404AwaitingDecision: number;
  byClassification: Record<Classification, number>;
  fullyResolved: number;
  unresolved: number;
  accountedFor: boolean;
};

export function reconcile(seed: readonly SeedRow[], records: readonly AuditedRecord[], queueReadable: boolean): Reconciliation {
  const seen = new Set<string>();
  const duplicateSeedEntries: string[] = [];
  for (const r of seed) {
    if (seen.has(r.path)) duplicateSeedEntries.push(r.path);
    seen.add(r.path);
  }
  const byClassification = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>;
  let sourceChecks = 0;
  let sourceChecksAnswered = 0;
  let redirectHopsObserved = 0;
  let targetChecks = 0;
  let observed404 = 0;
  let observed404AwaitingDecision = 0;
  for (const rec of records) {
    byClassification[rec.verdict.classification]++;
    for (const probe of [rec.evidence.probes.en, rec.evidence.probes.km]) {
      if (!probe) continue;
      sourceChecks++;
      if (probe.kind === "answered") sourceChecksAnswered++;
      redirectHopsObserved += probe.hops.filter((h) => REDIRECT.has(h.status)).length;
    }
    if (rec.evidence.target?.probe) targetChecks++;
    const en = analyseChain(rec.evidence.probes.en, "");
    const km = analyseChain(rec.evidence.probes.km, "/km");
    if (en.kind === "not_found" && km.kind === "not_found") {
      observed404++;
      const q = rec.evidence.queue;
      if (q !== "missing" && q !== "unavailable" && q.resolution === "pending") observed404AwaitingDecision++;
    }
  }
  const recordPaths = new Set(records.map((r) => r.path));
  const total = Object.values(byClassification).reduce((a, b) => a + b, 0);
  const fullyResolved = byClassification.RESOLVED_REDIRECT + byClassification.RESOLVED_RETIRED;
  return {
    seedEntries: seed.length,
    duplicateSeedEntries,
    originalRecords: seen.size,
    foundInQueue: queueReadable ? records.filter((r) => typeof r.evidence.queue === "object").length : null,
    missingFromQueue: records.filter((r) => r.evidence.queue === "missing").map((r) => r.path),
    withSuggestion: records.filter((r) => r.verdict.suggestion !== null).length,
    withoutSuggestion: records.filter((r) => r.verdict.suggestion === null).length,
    sourceChecks,
    sourceChecksAnswered,
    redirectHopsObserved,
    targetChecks,
    observed404,
    observed404AwaitingDecision,
    byClassification,
    fullyResolved,
    unresolved: records.length - fullyResolved,
    accountedFor: total === records.length && records.length === seen.size && [...seen].every((p) => recordPaths.has(p)),
  };
}
