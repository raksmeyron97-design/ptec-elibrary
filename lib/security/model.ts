/**
 * The security-event model — taxonomy, severity, risk scoring, fingerprints
 * and payload sanitization.
 *
 * PURE ON PURPOSE. No `server-only`, no DB, no `next/headers`, no secrets.
 * The detection engine, the incident engine, the Telegram formatter, the admin
 * dashboard and the unit tests all reason about events through this module, so
 * a rule can never mean one thing in the detector and another in the UI.
 * (Same discipline as `lib/ai/*` and `lib/admin/activity-log-shared.ts`.)
 *
 * ── Relationship to lib/security-log.ts ─────────────────────────────────────
 * `lib/security-log.ts` remains the emitter every call site uses; it imports
 * its taxonomy from here and re-exports it, so the 43 existing call sites are
 * untouched and there is exactly one list of event types.
 *
 * ── Relationship to docs/ALERT-CATALOG.md ───────────────────────────────────
 * The catalog is the POLICY. This module makes it executable. Where a severity
 * or threshold appears in both, the catalog is the source and this file cites
 * it. Changing a number here means changing it there in the same commit
 * (`lib/security/policy-parity.test.ts` checks the ones that can be checked).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Taxonomy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every security event type the system can record.
 *
 * The list is deliberately closed: a type earns a place only when something in
 * this deployment can actually produce it. Types whose source is not yet wired
 * are marked `SOURCELESS_TYPES` below and are excluded from detection so they
 * cannot masquerade as coverage.
 */
export type SecurityEventType =
  // ── Emitted by the request path (pre-existing; see lib/security-log.ts) ────
  | "auth_forbidden" // authenticated user lacked the required role/permission
  | "mfa_required" // admin-panel access attempted without AAL2
  | "rate_limited" // a rate limit fired
  | "captcha_failed" // Turnstile verification failed
  | "cron_auth_failed" // /api/cron/* called with a bad or missing secret
  | "upload_rejected" // file failed MIME/size/path validation
  | "virus_scan_blocked" // a file's hash matched known malware on VirusTotal
  | "virus_scan_error" // the VirusTotal lookup itself failed
  | "virus_scan_skipped" // no VIRUSTOTAL_API_KEY configured — not scanned
  | "suspicious_input" // input rejected at a trust boundary
  | "rights_blocked" // full-text redistribution not authorized
  | "download_blocked" // the library disabled downloads for this record
  | "csp_violation" // browser reported a CSP violation
  | "rate_limiter_degraded" // the DB rate limiter errored; fallback engaged
  | "lockdown_blocked" // refused by an emergency lockdown switch
  | "security_spike" // meta: one type fired unusually often
  // ── Authentication (server-side login proxy — decision D1) ─────────────────
  | "login_failed" // a password sign-in attempt was rejected
  | "login_succeeded" // a password sign-in attempt succeeded
  | "mfa_failed" // a TOTP verification was rejected
  | "auth_anomaly" // derived: an authentication pattern worth attention
  | "brute_force" // derived: many failures against ONE account
  | "credential_stuffing" // derived: failures spread across MANY accounts
  | "mfa_failure_spike" // derived: repeated TOTP rejections
  | "admin_auth_anomaly" // derived: the above, targeting an admin surface
  // ── Authorization ─────────────────────────────────────────────────────────
  | "privilege_change" // a role was changed (informational, always recorded)
  | "privilege_escalation" // derived: an admin/super_admin grant to watch
  // ── Request-shape abuse ───────────────────────────────────────────────────
  | "enumeration" // repeated unknown-route / 404 probing
  | "injection_pattern" // a request matched an attack signature (classified)
  | "api_abuse" // derived: sustained abusive API volume
  | "rate_limit_storm" // derived: rate_limited far above baseline
  | "captcha_storm" // derived: captcha_failed far above baseline
  | "scraping" // derived: bot-shaped read volume
  | "download_abuse" // derived: file/download volume far above baseline
  | "upload_abuse" // derived: repeated upload rejections
  | "malware_upload" // derived: malware blocked (or scanner failing open)
  // ── Infrastructure & pipeline (ingested from ops/CI — see §ingest) ────────
  | "waf_spike" // Cloudflare WAF activity spike  [SOURCELESS today]
  | "ddos_signal" // Cloudflare DDoS indicator      [SOURCELESS today]
  | "site_down" // external probe says the site is unreachable
  | "dependency_degraded" // DB or storage failing behind a live app
  | "backup_failed" // a backup run reported failure
  | "backup_stale" // no successful backup within policy
  | "cron_failed" // a scheduled sweep did not complete
  | "deploy_failed" // a production deployment failed
  | "migration_failed" // a database migration failed
  | "ci_failed" // a CI workflow failed
  | "secret_detected" // gitleaks found a committed secret
  | "dependency_vulnerability" // a vulnerable production dependency
  | "code_scanning_alert" // CodeQL raised an alert
  // ── Self-observability (§41) ──────────────────────────────────────────────
  | "alert_delivery_failed" // one alert could not be delivered
  | "alert_pipeline_degraded"; // derived: deliveries failing in bulk

/**
 * Types with no wired source in this deployment. They exist in the taxonomy so
 * the adapter boundary is typed (decision D3), but the detection engine skips
 * them and the dashboard reports them as "no source configured" rather than
 * "0 events" — which would read as "no attacks", a claim we cannot make.
 */
export const SOURCELESS_TYPES: readonly SecurityEventType[] = ["waf_spike", "ddos_signal"];

export function hasConfiguredSource(type: SecurityEventType): boolean {
  return !SOURCELESS_TYPES.includes(type);
}

/** Types produced by the detection engine rather than by a call site. */
export const DERIVED_TYPES: readonly SecurityEventType[] = [
  "security_spike",
  "auth_anomaly",
  "brute_force",
  "credential_stuffing",
  "mfa_failure_spike",
  "admin_auth_anomaly",
  "privilege_escalation",
  "api_abuse",
  "rate_limit_storm",
  "captcha_storm",
  "scraping",
  "download_abuse",
  "upload_abuse",
  "malware_upload",
  "alert_pipeline_degraded",
];

export function isDerived(type: SecurityEventType): boolean {
  return DERIVED_TYPES.includes(type);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Event shape
// ─────────────────────────────────────────────────────────────────────────────

export type ActorType = "anonymous" | "user" | "admin" | "system" | "external";

export type EventResult = "allowed" | "blocked" | "failed" | "success";

/** Severity, matching docs/ALERT-CATALOG.md §Severity model exactly. */
export type Severity = 1 | 2 | 3 | 4;

/**
 * The normalized event. `where`, `userId`, `ip`, `detail` and `requestId` are
 * the fields the existing 43 call sites already pass (see lib/security-log.ts);
 * everything else is derived by {@link normalizeEvent} so no call site has to
 * change to gain severity, risk and a fingerprint.
 */
export interface SecurityEventInput {
  type: SecurityEventType;
  /** Route or Server Action where the event occurred, e.g. "/api/push/send". */
  where: string;
  /** Authenticated user id (internal UUID), if known. */
  userId?: string;
  /** Client IP, if known. Never persisted raw — hashed at the sink. */
  ip?: string;
  /** Short technical context — no secrets, no user content. Sanitized here. */
  detail?: string;
  /** Correlation id — middleware's `x-request-id` (Cloudflare cf-ray reuse). */
  requestId?: string;
  /** Who acted. Inferred from `userId` when omitted. */
  actorType?: ActorType;
  /** What the request was aimed at (a role name, a service, a resource id). */
  target?: string;
  /** What happened to the request. Inferred from the type when omitted. */
  result?: EventResult;
  /** Structured, non-sensitive context. Values are sanitized and truncated. */
  metadata?: Record<string, unknown>;
  /** How many raw occurrences this event stands for (derived events only). */
  count?: number;
  /** Injectable clock for deterministic tests. */
  at?: number;
}

export interface NormalizedSecurityEvent {
  type: SecurityEventType;
  severity: Severity;
  riskScore: number;
  /** Human-readable, evidence-based reason the score is what it is. */
  riskReason: string;
  where: string;
  service: string;
  actorType: ActorType;
  actorId?: string;
  target?: string;
  result: EventResult;
  detail?: string;
  requestId?: string;
  ip?: string;
  count: number;
  /** Stable dedupe key: identical attacks collapse onto one incident. */
  fingerprint: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Severity — from docs/ALERT-CATALOG.md
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base severity per type. These mirror the catalog's Sev column; where the
 * catalog gives a range ("3 → 2 sustained", "3 (info) / 1 if unexpected") the
 * BASE is the calm end and escalation happens in {@link escalate} on evidence,
 * never on suspicion.
 */
const BASE_SEVERITY: Record<SecurityEventType, Severity> = {
  // Single low-signal occurrences: dashboard data, never an alert on their own.
  auth_forbidden: 4,
  mfa_required: 4,
  rate_limited: 4,
  captcha_failed: 4,
  upload_rejected: 4,
  virus_scan_skipped: 4,
  suspicious_input: 4,
  rights_blocked: 4,
  download_blocked: 4,
  csp_violation: 4,
  login_failed: 4,
  login_succeeded: 4,
  mfa_failed: 4,
  enumeration: 4,

  // Individually meaningful.
  cron_auth_failed: 2, // catalog: cron-secret-guessing, "any" → Sev 2
  virus_scan_blocked: 2, // catalog: malware-upload, "any" → Sev 2
  virus_scan_error: 3,
  rate_limiter_degraded: 2, // catalog: rate-limiter-degraded → Sev 2
  lockdown_blocked: 3, // catalog: lockdown-active → Sev 3 (1 if undeclared)
  security_spike: 2, // catalog: security-spike → Sev 2
  injection_pattern: 3,
  privilege_change: 3, // catalog: privilege-change → Sev 3 info

  // Derived aggregates — they exist only because a threshold was crossed.
  auth_anomaly: 2,
  brute_force: 2,
  credential_stuffing: 2,
  mfa_failure_spike: 2,
  admin_auth_anomaly: 2, // catalog: admin-auth-anomaly → Sev 2
  privilege_escalation: 1, // catalog: privilege-change "1 if unexpected"
  api_abuse: 3,
  rate_limit_storm: 2, // catalog: rate-limit-storm → Sev 2
  captcha_storm: 3, // catalog: captcha-storm → Sev 3
  scraping: 3,
  download_abuse: 3,
  upload_abuse: 3,
  malware_upload: 2,

  // Infrastructure.
  waf_spike: 3, // catalog: waf-spike → Sev 3 (2 sustained)
  ddos_signal: 2,
  site_down: 1, // catalog: site-down → Sev 1
  dependency_degraded: 1, // catalog: dependency-degraded → Sev 1 (db)
  backup_failed: 2, // catalog: backup-failed → Sev 2
  backup_stale: 2, // catalog: backup-stale → Sev 2
  cron_failed: 3, // catalog: cron-missed → Sev 3
  deploy_failed: 2,
  migration_failed: 2,
  ci_failed: 3,
  secret_detected: 1, // catalog: secret-in-history → Sev 1
  dependency_vulnerability: 3, // catalog: dependency-vuln → Sev 3
  code_scanning_alert: 3,

  alert_delivery_failed: 3,
  alert_pipeline_degraded: 2,
};

export function baseSeverity(type: SecurityEventType): Severity {
  return BASE_SEVERITY[type] ?? 4;
}

/** Raise a severity by `steps` (1 is the most severe; never past 1). */
export function escalate(severity: Severity, steps = 1): Severity {
  return Math.max(1, severity - steps) as Severity;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Informational",
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Risk scoring — deterministic and explainable
// ─────────────────────────────────────────────────────────────────────────────
//
// The brief's band model:
//     0–29 LOW · 30–59 MEDIUM · 60–79 HIGH · 80–100 CRITICAL
//
// The score is a sum of NAMED weights, and every event carries the sentence
// that explains it (`riskReason`). There is no model, no opaque heuristic and
// no "AI security score": an operator must be able to read why an incident is
// 92 and disagree with it. Weights are tuned so that:
//
//   • a single low-signal event never leaves LOW (rule 4 of the catalog's
//     anti-fatigue hygiene: no per-user-error alerts);
//   • crossing a threshold moves an event into MEDIUM/HIGH by volume alone;
//   • touching an admin surface, or SUCCEEDING where failure was expected,
//     is what pushes into CRITICAL.

export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function riskBand(score: number): RiskBand {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

/** Anchor weight per type — what one occurrence is worth before modifiers. */
const RISK_ANCHOR: Partial<Record<SecurityEventType, number>> = {
  // Noise floor: one of these is not news.
  rate_limited: 4,
  captcha_failed: 4,
  auth_forbidden: 8,
  mfa_required: 8,
  login_failed: 6,
  login_succeeded: 0,
  mfa_failed: 10,
  upload_rejected: 6,
  suspicious_input: 10,
  csp_violation: 4,
  enumeration: 6,
  rights_blocked: 2,
  download_blocked: 2,
  virus_scan_skipped: 10,

  // Individually meaningful.
  injection_pattern: 35,
  cron_auth_failed: 45,
  virus_scan_error: 25,
  virus_scan_blocked: 60,
  rate_limiter_degraded: 40,
  lockdown_blocked: 20,
  privilege_change: 30,

  // Derived aggregates.
  security_spike: 45,
  auth_anomaly: 45,
  brute_force: 55,
  credential_stuffing: 65,
  mfa_failure_spike: 60,
  admin_auth_anomaly: 70,
  privilege_escalation: 85,
  api_abuse: 45,
  rate_limit_storm: 50,
  captcha_storm: 40,
  scraping: 35,
  download_abuse: 45,
  upload_abuse: 40,
  malware_upload: 70,

  // Infrastructure.
  waf_spike: 45,
  ddos_signal: 65,
  site_down: 80,
  dependency_degraded: 75,
  backup_failed: 50,
  backup_stale: 45,
  cron_failed: 30,
  deploy_failed: 40,
  migration_failed: 55,
  ci_failed: 25,
  secret_detected: 95,
  dependency_vulnerability: 35,
  code_scanning_alert: 35,
  alert_delivery_failed: 30,
  alert_pipeline_degraded: 55,
};

/** Volume weight: log-scaled so 1 000 events is not 100× the risk of 10. */
function volumeWeight(count: number): number {
  if (count <= 1) return 0;
  return Math.min(25, Math.round(8 * Math.log10(count) * 2.2));
}

/** Admin/privileged surfaces are worth more than public ones. */
function surfaceWeight(where: string, target?: string): number {
  const s = `${where} ${target ?? ""}`.toLowerCase();
  if (/super[_-]?admin/.test(s)) return 20;
  if (/\/admin|admin\b|requireadmin|requiresuperadmin/.test(s)) return 12;
  if (/\/auth|login|mfa|password/.test(s)) return 8;
  if (/\/api\/cron|service[_-]?role/.test(s)) return 10;
  return 0;
}

/**
 * An attack that WORKED outranks one that was stopped. `blocked` earns a small
 * negative: the control did its job, and grading blocked traffic the same as
 * successful traffic is how a defence-in-depth stack drowns its operator.
 */
function resultWeight(result: EventResult, type: SecurityEventType): number {
  if (result === "success" || result === "allowed") {
    // Only meaningful where success is the bad outcome.
    const successIsBad: SecurityEventType[] = [
      "privilege_escalation",
      "privilege_change",
      "injection_pattern",
      "login_succeeded",
      "malware_upload",
    ];
    return successIsBad.includes(type) ? 15 : 0;
  }
  if (result === "blocked") return -5;
  return 0; // "failed"
}

export interface RiskInput {
  type: SecurityEventType;
  count?: number;
  where?: string;
  target?: string;
  result?: EventResult;
  actorType?: ActorType;
}

export interface RiskAssessment {
  score: number;
  band: RiskBand;
  reason: string;
}

/**
 * Score an event 0–100 and say why in one sentence.
 * Pure and total: unknown types score 0 rather than throwing.
 */
export function scoreRisk(input: RiskInput): RiskAssessment {
  const count = Math.max(1, input.count ?? 1);
  const parts: string[] = [];

  const anchor = RISK_ANCHOR[input.type] ?? 10;
  let score = anchor;
  parts.push(`${input.type} base ${anchor}`);

  const vol = volumeWeight(count);
  if (vol) {
    score += vol;
    parts.push(`${count} occurrences +${vol}`);
  }

  const surface = surfaceWeight(input.where ?? "", input.target);
  if (surface) {
    score += surface;
    parts.push(`privileged surface +${surface}`);
  }

  const res = resultWeight(input.result ?? "blocked", input.type);
  if (res) {
    score += res;
    parts.push(res > 0 ? `not blocked +${res}` : `blocked ${res}`);
  }

  if (input.actorType === "admin") {
    score += 10;
    parts.push("admin actor +10");
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return { score: clamped, band: riskBand(clamped), reason: parts.join(", ") };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Fingerprints — the dedupe key
// ─────────────────────────────────────────────────────────────────────────────
//
// A fingerprint answers "is this the same problem I already told you about?".
// It must be STABLE across occurrences of one attack and DISTINCT between
// different ones — and low-cardinality, or every event opens its own incident
// and the dedupe is decorative.
//
// Shape: `<type>:<scope>`. The scope is the narrowest thing that stays constant
// for the duration of one attack: the targeted surface for probing, the target
// principal for privilege changes, the service for infrastructure.

/** Collapse a route to its shape so `/books/abc` and `/books/xyz` agree. */
export function routeScope(where: string): string {
  if (!where) return "unknown";
  const path = where.split("?")[0].slice(0, 120);
  return (
    path
      // Next.js dynamic segments are already shaped: keep them.
      .replace(/\[[^\]]+\]/g, ":id")
      // UUIDs, then long slugs/hashes, then bare numbers.
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ":id")
      .replace(/\/[0-9a-z._-]{24,}/gi, "/:id")
      .replace(/\/\d+/g, "/:n")
      .toLowerCase() || "unknown"
  );
}

/** Group an event type into the family its incidents share. */
const FAMILY: Partial<Record<SecurityEventType, string>> = {
  login_failed: "auth_attack",
  mfa_failed: "auth_attack",
  brute_force: "auth_attack",
  credential_stuffing: "auth_attack",
  mfa_failure_spike: "auth_attack",
  auth_anomaly: "auth_attack",
  admin_auth_anomaly: "auth_attack",
  auth_forbidden: "auth_attack",
  mfa_required: "auth_attack",
  privilege_change: "privilege",
  privilege_escalation: "privilege",
  rate_limited: "abuse",
  rate_limit_storm: "abuse",
  api_abuse: "abuse",
  scraping: "abuse",
  download_abuse: "abuse",
  captcha_failed: "abuse",
  captcha_storm: "abuse",
  enumeration: "abuse",
  injection_pattern: "injection",
  upload_rejected: "upload",
  upload_abuse: "upload",
  virus_scan_blocked: "malware",
  virus_scan_error: "malware",
  virus_scan_skipped: "malware",
  malware_upload: "malware",
  site_down: "availability",
  dependency_degraded: "availability",
  waf_spike: "edge",
  ddos_signal: "edge",
};

export function eventFamily(type: SecurityEventType): string {
  return FAMILY[type] ?? type;
}

export interface FingerprintInput {
  type: SecurityEventType;
  where?: string;
  target?: string;
  service?: string;
  /** Set only where the actor genuinely scopes the incident (privilege). */
  actorId?: string;
}

/**
 * Build the stable incident key. Deliberately does NOT include the IP: an
 * attacker rotating addresses would otherwise open a new incident per address,
 * which is the noise this whole system exists to prevent (and would persist a
 * raw IP into a durable identifier, which the privacy contract forbids).
 */
export function fingerprint(input: FingerprintInput): string {
  const family = eventFamily(input.type);
  switch (family) {
    case "auth_attack":
      // One incident per attacked surface: the admin login and the public
      // login are different incidents; two accounts on the same form are not.
      return `auth_attack:${authSurface(input.where ?? "", input.target)}`;
    case "privilege":
      // Scoped to the principal whose privileges changed — that is the thing
      // an operator must review, and it is a UUID we already store.
      return `privilege:${input.target ?? input.actorId ?? "unknown"}`;
    case "availability":
      return `${input.type}:${input.service ?? "production"}`;
    case "edge":
      return `${input.type}:${input.service ?? "cloudflare"}`;
    case "injection":
      // Scoped by SIGNATURE CLASS, not just route: an SQL-injection probe and
      // a path-traversal probe against the same endpoint have different
      // playbooks and must not collapse into one incident.
      return `injection:${input.target ?? "unclassified"}:${routeScope(input.where ?? "unknown")}`;
    case "malware":
      return `malware:${input.service ?? "uploads"}`;
    default:
      return `${input.type}:${routeScope(input.where ?? input.service ?? "unknown")}`;
  }
}

function authSurface(where: string, target?: string): string {
  const s = `${where} ${target ?? ""}`.toLowerCase();
  if (/admin/.test(s)) return "admin";
  if (/mfa/.test(s)) return "mfa";
  return "public";
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Sanitization — §27 of the brief, and rule 6 of the catalog
// ─────────────────────────────────────────────────────────────────────────────
//
// Anything that reaches a durable row or a Telegram message passes through
// here. The rule is not "try to redact secrets" — it is "carry so little that
// there is nothing to redact". These patterns are the belt to that braces:
// they catch a caller who passes something they should not have.

const SECRET_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, label: "[jwt]" },
  { re: /\bsb[ps]?_[A-Za-z0-9_-]{20,}/g, label: "[supabase-key]" },
  { re: /\b(?:sk|pk|rk)_[A-Za-z0-9]{16,}/g, label: "[api-key]" },
  { re: /\bAIza[0-9A-Za-z_-]{20,}/g, label: "[google-key]" },
  { re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, label: "[telegram-token]" },
  { re: /\bghp_[A-Za-z0-9]{20,}/g, label: "[github-token]" },
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, label: "[email]" },
  // Any bearer/authorization value, whatever its shape.
  { re: /\b(?:bearer|authorization|apikey|api_key|token|password|passwd|secret)\s*[:=]\s*\S+/gi, label: "[redacted]" },
];

/** The longest a `detail` string may be. Long values are evidence of a leak. */
export const MAX_DETAIL_LENGTH = 300;

/**
 * Scrub a free-text field: redact anything that looks like a credential or an
 * email address, collapse whitespace, and truncate. Never throws.
 */
export function sanitizeText(value: unknown, maxLength = MAX_DETAIL_LENGTH): string | undefined {
  if (value === null || value === undefined) return undefined;
  let s = typeof value === "string" ? value : String(value);
  for (const { re, label } of SECRET_PATTERNS) s = s.replace(re, label);
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.length > maxLength ? `${s.slice(0, maxLength - 1)}…` : s;
}

/** Keys whose VALUE is never safe to keep, whatever it contains. */
const FORBIDDEN_KEYS =
  /^(password|passwd|pass|token|access_token|refresh_token|secret|api_?key|apikey|authorization|auth|cookie|session|jwt|credential|otp|code|body|payload|message|content|prompt|query|note)$/i;

export const MAX_METADATA_KEYS = 20;

/**
 * Sanitize a metadata object for persistence and notification.
 *
 * Rules: forbidden keys are dropped outright (not redacted — a redacted
 * password is still a record that one was passed); strings are scrubbed;
 * numbers/booleans pass through; nested objects are summarized rather than
 * recursed, because deep structures are where payloads hide.
 */
export function sanitizeMetadata(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(input)) {
    if (kept >= MAX_METADATA_KEYS) break;
    if (FORBIDDEN_KEYS.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
      kept++;
    } else if (typeof value === "boolean") {
      out[key] = value;
      kept++;
    } else if (typeof value === "string") {
      const clean = sanitizeText(value, 200);
      if (clean !== undefined) {
        out[key] = clean;
        kept++;
      }
    } else if (Array.isArray(value)) {
      out[key] = `[${value.length} items]`;
      kept++;
    } else if (typeof value === "object") {
      out[key] = `{${Object.keys(value as object).length} keys}`;
      kept++;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Attack-signature classification
// ─────────────────────────────────────────────────────────────────────────────
//
// We record the CLASS of a suspicious request, never the request. A stored
// payload is a stored attack: it re-enters logs, dashboards, CSV exports and
// Telegram messages, where it can be re-executed by whatever renders it. So
// the detector answers "which family did this match?" and nothing else.
//
// Language matters too (§42): a match is a "possible <X> pattern", not
// "an attack". These regexes have false positives — a bibliography containing
// "SELECT * FROM" is a legitimate library search.

export type SignatureClass =
  | "sqli.union"
  | "sqli.boolean"
  | "sqli.comment"
  | "xss.script"
  | "xss.event_handler"
  | "xss.javascript_uri"
  | "traversal.dotdot"
  | "traversal.encoded"
  | "cmdi.shell"
  | "ssrf.internal_host"
  | "scanner.wellknown_probe";

const SIGNATURES: { cls: SignatureClass; re: RegExp }[] = [
  { cls: "sqli.union", re: /\bunion\b[\s/*]+\bselect\b/i },
  { cls: "sqli.boolean", re: /\b(or|and)\b\s+['"`]?\d+['"`]?\s*=\s*['"`]?\d+/i },
  { cls: "sqli.comment", re: /(--\s|\/\*|;\s*drop\s+table|\bsleep\s*\(|\bbenchmark\s*\()/i },
  { cls: "xss.script", re: /<\s*script\b|<\s*\/\s*script\s*>|<\s*iframe\b|<\s*svg\b[^>]*\bon\w+/i },
  { cls: "xss.event_handler", re: /\bon(?:error|load|click|mouseover|focus)\s*=/i },
  { cls: "xss.javascript_uri", re: /javascript\s*:|data:text\/html/i },
  { cls: "traversal.dotdot", re: /(?:^|[/\\])\.\.(?:[/\\]|$)/ },
  { cls: "traversal.encoded", re: /%2e%2e[/\\]|%252e%252e|\.\.%2f/i },
  { cls: "cmdi.shell", re: /[;|`]\s*(?:cat|curl|wget|nc|bash|sh|python|perl)\s|\$\([^)]*\)/i },
  { cls: "ssrf.internal_host", re: /\b(?:127\.0\.0\.1|localhost|169\.254\.169\.254|0\.0\.0\.0|\[::1\])\b/i },
  { cls: "scanner.wellknown_probe", re: /\/(?:wp-admin|wp-login|\.env|\.git\/|phpmyadmin|xmlrpc\.php|\.aws\/|config\.json|admin\.php)/i },
];

/**
 * Classify a request path/query against known attack shapes.
 *
 * Returns the classes matched — NEVER the matched text. An empty array means
 * "nothing matched", which is not the same as "safe".
 */
export function classifySignatures(input: string | null | undefined): SignatureClass[] {
  if (!input) return [];
  // Decode once so a single layer of percent-encoding cannot hide a match;
  // decoding further would itself be an attack surface (decoding bombs).
  let subject = input.slice(0, 2048);
  try {
    subject = `${subject} ${decodeURIComponent(subject)}`;
  } catch {
    // Malformed encoding is itself worth matching on — keep the raw value.
  }
  const out: SignatureClass[] = [];
  for (const { cls, re } of SIGNATURES) {
    if (re.test(subject)) out.push(cls);
  }
  return out;
}

/** Family of a signature class, for the fingerprint and the event type. */
export function signatureEventType(classes: SignatureClass[]): SecurityEventType | null {
  if (!classes.length) return null;
  return "injection_pattern";
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Normalization — the one entry point
// ─────────────────────────────────────────────────────────────────────────────

function inferActorType(input: SecurityEventInput): ActorType {
  if (input.actorType) return input.actorType;
  if (input.type === "security_spike" || isDerived(input.type)) return "system";
  if (input.userId) return "user";
  return "anonymous";
}

function inferResult(input: SecurityEventInput): EventResult {
  if (input.result) return input.result;
  switch (input.type) {
    case "login_succeeded":
    case "privilege_change":
    case "privilege_escalation":
      return "success";
    case "virus_scan_error":
    case "rate_limiter_degraded":
    case "alert_delivery_failed":
    case "site_down":
    case "dependency_degraded":
    case "backup_failed":
    case "cron_failed":
    case "deploy_failed":
    case "migration_failed":
    case "ci_failed":
      return "failed";
    default:
      return "blocked";
  }
}

/** Coarse service name, for grouping in the dashboard and Telegram. */
export function serviceFor(where: string): string {
  const w = (where || "").toLowerCase();
  if (w.includes("/admin") || w.includes("admin")) return "admin";
  if (w.includes("/auth") || w.includes("login") || w.includes("mfa")) return "auth";
  if (w.includes("/api/cron")) return "cron";
  if (w.includes("upload") || w.includes("virus")) return "uploads";
  if (w.includes("download") || w.includes("/file")) return "delivery";
  if (w.includes("search")) return "search";
  if (w.includes("/api")) return "api";
  return "app";
}

/**
 * Turn a raw call-site event into the normalized shape everything downstream
 * uses. Total and side-effect free — safe to call from anywhere, including
 * inside a `catch`.
 */
export function normalizeEvent(input: SecurityEventInput): NormalizedSecurityEvent {
  const count = Math.max(1, Math.floor(input.count ?? 1));
  const actorType = inferActorType(input);
  const result = inferResult(input);
  const service = serviceFor(input.where);
  const risk = scoreRisk({
    type: input.type,
    count,
    where: input.where,
    target: input.target,
    result,
    actorType,
  });

  // Severity floor from the catalog, raised only on evidence: a CRITICAL risk
  // band means the volume/surface/outcome modifiers actually fired.
  let severity = baseSeverity(input.type);
  if (risk.band === "CRITICAL" && severity > 1) severity = escalate(severity);

  return {
    type: input.type,
    severity,
    riskScore: risk.score,
    riskReason: risk.reason,
    where: input.where,
    service,
    actorType,
    actorId: input.userId,
    target: input.target,
    result,
    detail: sanitizeText(input.detail),
    requestId: input.requestId,
    ip: input.ip,
    count,
    fingerprint: fingerprint({
      type: input.type,
      where: input.where,
      target: input.target,
      service,
      actorId: input.userId,
    }),
    timestamp: new Date(input.at ?? Date.now()).toISOString(),
    metadata: sanitizeMetadata(input.metadata),
  };
}
