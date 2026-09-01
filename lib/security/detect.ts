/**
 * The detection engine — pure functions from a window of security events to
 * findings.
 *
 * PURE ON PURPOSE (no `server-only`, no DB): the tests exercise the real
 * decision functions offline with synthetic event windows, exactly like
 * `lib/ai/*` does for the assistant. A detector that can only be tested by
 * standing up Postgres is a detector nobody retunes.
 *
 * ── The three-noun rule (brief §7) ──────────────────────────────────────────
 *   EVENT     one thing that happened. Recorded always. Alerts never.
 *   FINDING   a threshold was crossed. Produced here.
 *   INCIDENT  the durable, deduplicated record an operator is told about.
 *             Produced by `lib/security/incidents.ts` from findings.
 * 100 failed logins = 100 events → 1 finding → 1 incident → 1 alert.
 *
 * ── What is deliberately NOT detected ───────────────────────────────────────
 * `waf_spike` and `ddos_signal` have no source in this deployment (decision D3
 * — no Cloudflare API token). They are absent from DETECTORS rather than
 * present-and-never-firing, so the dashboard can say "no source configured"
 * instead of "0 detections", which would read as "no attacks".
 *
 * Thresholds live in `lib/security/config.ts`; the policy they implement lives
 * in docs/ALERT-CATALOG.md. Nothing is hard-coded here.
 */

import {
  baseSeverity,
  escalate,
  eventFamily,
  fingerprint as fingerprintOf,
  riskBand,
  scoreRisk,
  type ActorType,
  type EventResult,
  type SecurityEventType,
  type Severity,
} from "./model";
import {
  adminAuthAnomalyThreshold,
  adminAuthAnomalyWindowSeconds,
  authAttackThreshold,
  authAttackWindowSeconds,
  baselineDeviationFactor,
  baselineMinSamples,
  captchaStormThreshold,
  credentialStuffingAccounts,
  downloadAbuseThreshold,
  enumerationThreshold,
  enumerationWindowSeconds,
  injectionThreshold,
  mfaFailureThreshold,
  rateLimitAlertThreshold,
  rateLimitAlertWindowSeconds,
  suspiciousSuccessAfterFailures,
  uploadAbuseThreshold,
  uploadAbuseWindowSeconds,
} from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One persisted event, as the detection pass reads it back. */
export interface SecurityEventRecord {
  id: number;
  type: SecurityEventType;
  severity: Severity;
  riskScore: number;
  service: string;
  where: string;
  actorType: ActorType;
  actorId: string | null;
  target: string | null;
  result: EventResult;
  detail: string | null;
  requestId: string | null;
  /** Daily-rotating keyed hash. The closest thing to a client identity we hold. */
  ipHash: string | null;
  count: number;
  fingerprint: string;
  metadata: Record<string, unknown>;
  /** Epoch ms. */
  occurredAt: number;
}

export interface Baseline {
  signal: string;
  mean: number;
  stddev: number | null;
  sampleCount: number;
}

export interface DetectionContext {
  now: number;
  events: SecurityEventRecord[];
  baselines?: Map<string, Baseline>;
}

export interface Finding {
  type: SecurityEventType;
  severity: Severity;
  riskScore: number;
  category: string;
  service: string;
  title: string;
  fingerprint: string;
  /**
   * Why this fired, with the numbers that made it fire. This string is shown
   * verbatim in Telegram and on the incident page, so it must be true,
   * specific, and free of claims the evidence does not support (§42).
   */
  detectionReason: string;
  eventCount: number;
  eventIds: number[];
  firstSeen: number;
  lastSeen: number;
  runbook?: string;
  /** Which detector produced it — for the "detection reason" panel. */
  detector: string;
  /**
   * True when the evidence includes something that WORKED, not merely
   * something that was blocked (a sign-in that succeeded, a role that was
   * granted, a file that was accepted unscanned).
   *
   * This is load-bearing in `detect()`: two detectors routinely notice the
   * same attack, and at equal severity the one holding evidence of success
   * must win. Without it, "a sign-in succeeded after 10 failures" was
   * silently dropped in favour of "10 sign-ins failed" — the same incident
   * reported as an attempt rather than as a possible breach.
   */
  succeeded: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runbooks — every high-severity finding must link to one (brief §35)
// ─────────────────────────────────────────────────────────────────────────────

const RUNBOOKS: Partial<Record<SecurityEventType, string>> = {
  brute_force: "docs/RUNBOOKS.md §I8",
  credential_stuffing: "docs/RUNBOOKS.md §I8",
  mfa_failure_spike: "docs/RUNBOOKS.md §I8",
  auth_anomaly: "docs/RUNBOOKS.md §I8",
  admin_auth_anomaly: "docs/RUNBOOKS.md §I8",
  privilege_escalation: "docs/RUNBOOKS.md §I9",
  privilege_change: "docs/RUNBOOKS.md §M12",
  cron_auth_failed: "docs/RUNBOOKS.md §I10",
  secret_detected: "docs/RUNBOOKS.md §I10",
  malware_upload: "docs/RUNBOOKS.md §I12",
  virus_scan_blocked: "docs/RUNBOOKS.md §I12",
  upload_abuse: "docs/RUNBOOKS.md §I3",
  rate_limit_storm: "docs/RUNBOOKS.md §I13",
  api_abuse: "docs/DDOS-PROTECTION.md",
  captcha_storm: "docs/DDOS-PROTECTION.md",
  scraping: "docs/DDOS-PROTECTION.md",
  download_abuse: "docs/RUNBOOKS.md §I13",
  enumeration: "docs/DDOS-PROTECTION.md",
  injection_pattern: "docs/SECURITY-HEADERS.md",
  waf_spike: "docs/DDOS-PROTECTION.md",
  ddos_signal: "docs/DDOS-PROTECTION.md",
  rate_limiter_degraded: "docs/RUNBOOKS.md §I2",
  lockdown_blocked: "docs/SECURITY_DEFENSE_IN_DEPTH.md §Lockdown",
  site_down: "docs/RUNBOOKS.md §I1",
  dependency_degraded: "docs/RUNBOOKS.md §I2",
  backup_failed: "docs/RUNBOOKS.md §I17",
  backup_stale: "docs/RUNBOOKS.md §I17",
  cron_failed: "docs/RUNBOOKS.md §M2",
  deploy_failed: "docs/RUNBOOKS.md §I15",
  migration_failed: "docs/RUNBOOKS.md §I16",
  dependency_vulnerability: "docs/RUNBOOKS.md §M5",
  alert_pipeline_degraded: "docs/MONITORING.md §Log-based alerts",
};

export function runbookFor(type: SecurityEventType): string | undefined {
  return RUNBOOKS[type];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function within(ctx: DetectionContext, seconds: number): SecurityEventRecord[] {
  const cutoff = ctx.now - seconds * 1000;
  return ctx.events.filter((e) => e.occurredAt >= cutoff);
}

function ofType(
  events: SecurityEventRecord[],
  ...types: SecurityEventType[]
): SecurityEventRecord[] {
  return events.filter((e) => types.includes(e.type));
}

/**
 * Events attributable to verified good crawlers are excluded from every
 * volume-based detector. Googlebot enumerating the catalog is the library
 * working as intended; alerting on it is how an operator learns to ignore the
 * channel (catalog hygiene rule 4). Emission sites tag these using the
 * existing DNS-verified check in `lib/security/crawler.ts`.
 */
function excludeVerifiedCrawlers(events: SecurityEventRecord[]): SecurityEventRecord[] {
  return events.filter((e) => e.metadata?.crawler !== "verified");
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** Total occurrences, honouring aggregated events that stand for many. */
function weight(events: SecurityEventRecord[]): number {
  return events.reduce((sum, e) => sum + Math.max(1, e.count), 0);
}

function span(events: SecurityEventRecord[]): { firstSeen: number; lastSeen: number } {
  let firstSeen = Infinity;
  let lastSeen = -Infinity;
  for (const e of events) {
    if (e.occurredAt < firstSeen) firstSeen = e.occurredAt;
    if (e.occurredAt > lastSeen) lastSeen = e.occurredAt;
  }
  return { firstSeen: Number.isFinite(firstSeen) ? firstSeen : 0, lastSeen: Number.isFinite(lastSeen) ? lastSeen : 0 };
}

/** Cap the ids we carry: an incident does not need 20 000 foreign keys. */
const MAX_EVIDENCE_IDS = 200;

function makeFinding(args: {
  detector: string;
  type: SecurityEventType;
  events: SecurityEventRecord[];
  title: string;
  detectionReason: string;
  service?: string;
  where?: string;
  target?: string;
  result?: EventResult;
  severityOverride?: Severity;
}): Finding {
  const { firstSeen, lastSeen } = span(args.events);
  const count = weight(args.events);
  const service = args.service ?? args.events[0]?.service ?? "app";
  const where = args.where ?? args.events[0]?.where ?? service;

  const risk = scoreRisk({
    type: args.type,
    count,
    where,
    target: args.target,
    result: args.result ?? "blocked",
  });

  const succeeded = args.result === "success" || args.result === "allowed";

  // Severity floor is the catalog's. It is raised ONLY when the evidence
  // includes something that WORKED — never by volume alone.
  //
  // Volume-based escalation was tried and reverted: 12 blocked sign-in
  // attempts on /admin/login scored 96 (CRITICAL) and became Sev 1, which
  // means "act immediately, any hour". Paging a librarian at 03:00 because a
  // scripted scanner failed twelve times is precisely how a channel stops
  // being read. A stopped attack is same-working-day work; an attack that got
  // through is not.
  let severity = args.severityOverride ?? baseSeverity(args.type);
  if (!args.severityOverride && succeeded && riskBand(risk.score) === "CRITICAL" && severity > 1) {
    severity = escalate(severity);
  }

  return {
    detector: args.detector,
    type: args.type,
    succeeded,
    severity,
    riskScore: risk.score,
    category: eventFamily(args.type),
    service,
    title: args.title,
    fingerprint: fingerprintOf({ type: args.type, where, target: args.target, service }),
    detectionReason: args.detectionReason,
    eventCount: count,
    eventIds: args.events.slice(0, MAX_EVIDENCE_IDS).map((e) => e.id),
    firstSeen,
    lastSeen,
    runbook: runbookFor(args.type),
  };
}

/** "in the last 15 minutes" — responders read minutes, not seconds. */
function humanWindow(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detectors
// ─────────────────────────────────────────────────────────────────────────────

export type Detector = {
  name: string;
  /** Human explanation for the dashboard's coverage table. */
  describes: string;
  run(ctx: DetectionContext): Finding[];
};

/**
 * Brute force — many failed sign-ins against ONE account.
 * Only observable because password sign-in is proxied server-side (D1);
 * GoTrue records no failed-login audit entry (SECURITY_MONITORING_AUDIT §3.1).
 */
const bruteForce: Detector = {
  name: "brute_force",
  describes: "Repeated failed sign-ins against a single account",
  run(ctx) {
    const windowSec = authAttackWindowSeconds();
    const threshold = authAttackThreshold();
    const failures = ofType(within(ctx, windowSec), "login_failed");
    const findings: Finding[] = [];

    for (const [account, events] of groupBy(failures, (e) => e.target)) {
      const count = weight(events);
      if (count < threshold) continue;
      const admin = events.some((e) => e.where.includes("admin"));
      findings.push(
        makeFinding({
          detector: "brute_force",
          type: admin ? "admin_auth_anomaly" : "brute_force",
          events,
          where: events[0].where,
          title: admin
            ? "Authentication attack pattern on the admin login"
            : "Authentication attack pattern on one account",
          // Never name the account in the reason — this string reaches
          // Telegram. The incident page resolves the target for an operator
          // who is already authenticated.
          detectionReason:
            `${count} failed sign-in attempts against a single account in the last ` +
            `${humanWindow(windowSec)} (threshold ${threshold}). ` +
            `Account identifier withheld from the alert; see the incident page.`,
          target: account,
          result: "blocked",
        }),
      );
    }
    return findings;
  },
};

/** Credential stuffing — failures spread across MANY accounts from one client. */
const credentialStuffing: Detector = {
  name: "credential_stuffing",
  describes: "Failed sign-ins spread across many accounts from one client",
  run(ctx) {
    const windowSec = authAttackWindowSeconds();
    const minAccounts = credentialStuffingAccounts();
    const failures = ofType(within(ctx, windowSec), "login_failed");
    const findings: Finding[] = [];

    for (const [, events] of groupBy(failures, (e) => e.ipHash)) {
      const accounts = new Set(events.map((e) => e.target).filter(Boolean));
      if (accounts.size < minAccounts) continue;
      findings.push(
        makeFinding({
          detector: "credential_stuffing",
          type: "credential_stuffing",
          events,
          where: events[0].where,
          title: "Credential-stuffing pattern — many accounts, one client",
          detectionReason:
            `${weight(events)} failed sign-in attempts against ${accounts.size} distinct accounts ` +
            `from one client in the last ${humanWindow(windowSec)} ` +
            `(threshold ${minAccounts} accounts). Client identified by a daily-rotating hash, not an address.`,
          result: "blocked",
        }),
      );
    }
    return findings;
  },
};

/** MFA failure spike — repeated rejected TOTP verifications. */
const mfaFailureSpike: Detector = {
  name: "mfa_failure_spike",
  describes: "Repeated rejected second-factor verifications",
  run(ctx) {
    const windowSec = authAttackWindowSeconds();
    const threshold = mfaFailureThreshold();
    const events = ofType(within(ctx, windowSec), "mfa_failed");
    if (weight(events) < threshold) return [];
    return [
      makeFinding({
        detector: "mfa_failure_spike",
        type: "mfa_failure_spike",
        events,
        where: "/admin/mfa",
        title: "Second-factor verification failing repeatedly",
        detectionReason:
          `${weight(events)} rejected TOTP verifications in the last ${humanWindow(windowSec)} ` +
          `(threshold ${threshold}). Either a stolen password is being tested against MFA, ` +
          `or an authenticator's clock has drifted — the incident page shows which accounts.`,
        result: "blocked",
      }),
    ];
  },
};

/**
 * A sign-in that SUCCEEDED right after a run of failures against the same
 * account. This is the highest-value authentication signal there is: it is the
 * difference between an attack and a breach.
 */
const suspiciousSuccess: Detector = {
  name: "auth_success_after_failures",
  describes: "A successful sign-in immediately following repeated failures",
  run(ctx) {
    const windowSec = authAttackWindowSeconds();
    const minFailures = suspiciousSuccessAfterFailures();
    const recent = within(ctx, windowSec);
    const successes = ofType(recent, "login_succeeded");
    const failures = ofType(recent, "login_failed");
    const findings: Finding[] = [];

    for (const success of successes) {
      if (!success.target) continue;
      const priorFailures = failures.filter(
        (f) => f.target === success.target && f.occurredAt < success.occurredAt,
      );
      const count = weight(priorFailures);
      if (count < minFailures) continue;
      const admin = success.where.includes("admin");
      findings.push(
        makeFinding({
          detector: "auth_success_after_failures",
          type: admin ? "admin_auth_anomaly" : "auth_anomaly",
          events: [...priorFailures, success],
          where: success.where,
          title: admin
            ? "Admin sign-in succeeded after repeated failures"
            : "Sign-in succeeded after repeated failures",
          detectionReason:
            `A sign-in succeeded after ${count} failed attempts against the same account within ` +
            `${humanWindow(windowSec)} (threshold ${minFailures}). This may be a legitimate user who ` +
            `recovered their password, or a guessed credential — treat as a possible compromise ` +
            `until the account holder confirms.`,
          target: success.target,
          result: "success",
          // Deliberately fixed at Sev 1 for admin: the risk model would score
          // it high, but "someone may now be inside the admin panel" is a
          // page-now event regardless of how the arithmetic lands.
          severityOverride: admin ? 1 : 2,
        }),
      );
    }
    return findings;
  },
};

/**
 * Catalog `admin-auth-anomaly`: an ALREADY-AUTHENTICATED principal repeatedly
 * hitting surfaces above its privilege. Distinct from password guessing.
 */
const authorizationProbing: Detector = {
  name: "authorization_probing",
  describes: "An authenticated account repeatedly refused at privileged surfaces",
  run(ctx) {
    const windowSec = adminAuthAnomalyWindowSeconds();
    const threshold = adminAuthAnomalyThreshold();
    const events = ofType(within(ctx, windowSec), "auth_forbidden", "mfa_required");
    const findings: Finding[] = [];

    for (const [, group] of groupBy(events, (e) => e.actorId ?? e.ipHash)) {
      const count = weight(group);
      if (count < threshold) continue;
      findings.push(
        makeFinding({
          detector: "authorization_probing",
          type: "admin_auth_anomaly",
          events: group,
          where: group[0].where,
          title: "Repeated authorization failures from one principal",
          detectionReason:
            `${count} authorization refusals (auth_forbidden / mfa_required) from a single principal in ` +
            `the last ${humanWindow(windowSec)} (catalog threshold ${threshold}/h). ` +
            `These are refusals of an account that IS signed in — privilege probing, not password guessing.`,
          result: "blocked",
        }),
      );
    }
    return findings;
  },
};

/**
 * Privilege escalation. The only detector here whose signal existed all along
 * and was simply never read (SECURITY_MONITORING_AUDIT §3.5).
 *
 * Every role change is recorded as an event; this promotes the ones that grant
 * admin or super_admin. It does NOT claim the change was unauthorized — it
 * claims the change happened and must be reviewed, which is exactly what the
 * catalog's "3 (info) / 1 if unexpected" means in practice.
 */
const privilegeEscalation: Detector = {
  name: "privilege_escalation",
  describes: "A grant of an administrative role",
  run(ctx) {
    const events = ofType(ctx.events, "privilege_change");
    const findings: Finding[] = [];

    for (const event of events) {
      const to = String(event.metadata?.to ?? event.target ?? "").toLowerCase();
      if (to !== "admin" && to !== "super_admin") continue;
      const from = String(event.metadata?.from ?? "unknown");
      findings.push(
        makeFinding({
          detector: "privilege_escalation",
          type: "privilege_escalation",
          events: [event],
          where: event.where,
          target: String(event.metadata?.targetUserId ?? event.target ?? "unknown"),
          title: `Role granted: ${from} → ${to}`,
          detectionReason:
            `An account was granted the "${to}" role (previous role: "${from}"). ` +
            `Every such grant opens an incident for review — acknowledge it if it was expected. ` +
            `This is a record that the change happened, not a claim that it was unauthorized.`,
          result: "success",
          severityOverride: to === "super_admin" ? 1 : 2,
        }),
      );
    }
    return findings;
  },
};

/** Catalog `rate-limit-storm`: rate limits firing far above normal. */
const rateLimitStorm: Detector = {
  name: "rate_limit_storm",
  describes: "Rate limits firing far above the configured threshold",
  run(ctx) {
    const windowSec = rateLimitAlertWindowSeconds();
    const threshold = rateLimitAlertThreshold();
    const events = excludeVerifiedCrawlers(ofType(within(ctx, windowSec), "rate_limited"));
    const findings: Finding[] = [];

    // Grouped by route shape: a storm on /api/search and one on the download
    // routes are different problems with different playbooks.
    for (const [route, group] of groupBy(events, (e) => e.fingerprint)) {
      const count = weight(group);
      const isDelivery = group[0].service === "delivery";
      const limit = isDelivery ? downloadAbuseThreshold() : threshold;
      if (count < limit) continue;

      const baselineNote = describeBaseline(ctx, route, count, windowSec);
      findings.push(
        makeFinding({
          detector: "rate_limit_storm",
          type: isDelivery ? "download_abuse" : "rate_limit_storm",
          events: group,
          where: group[0].where,
          title: isDelivery
            ? "Download rate limits firing repeatedly"
            : "Rate-limit storm on one route",
          detectionReason:
            `${count} rate-limit refusals on ${route} in the last ${humanWindow(windowSec)} ` +
            `(threshold ${limit})${baselineNote}. Verified crawlers are excluded from this count.`,
          result: "blocked",
        }),
      );
    }
    return findings;
  },
};

/** Catalog `captcha-storm`: a bot campaign against the forms. */
const captchaStorm: Detector = {
  name: "captcha_storm",
  describes: "Turnstile failing far above normal — a bot campaign on the forms",
  run(ctx) {
    const windowSec = rateLimitAlertWindowSeconds();
    const threshold = captchaStormThreshold();
    const events = ofType(within(ctx, windowSec), "captcha_failed");
    const count = weight(events);
    if (count < threshold) return [];
    return [
      makeFinding({
        detector: "captcha_storm",
        type: "captcha_storm",
        events,
        where: events[0].where,
        title: "CAPTCHA failures far above normal",
        detectionReason:
          `${count} Turnstile verification failures in the last ${humanWindow(windowSec)} ` +
          `(threshold ${threshold}). Consistent with automated form submission; the CAPTCHA is ` +
          `doing its job — this is a volume signal, not a breach.`,
        result: "blocked",
      }),
    ];
  },
};

/** Unknown-route probing — the reconnaissance stage of most attacks. */
const enumerationDetector: Detector = {
  name: "enumeration",
  describes: "Repeated probing of routes that do not exist",
  run(ctx) {
    const windowSec = enumerationWindowSeconds();
    const threshold = enumerationThreshold();
    const events = excludeVerifiedCrawlers(ofType(within(ctx, windowSec), "enumeration"));
    const findings: Finding[] = [];

    for (const [, group] of groupBy(events, (e) => e.ipHash)) {
      const count = weight(group);
      if (count < threshold) continue;
      const paths = new Set(group.map((e) => e.where));
      findings.push(
        makeFinding({
          detector: "enumeration",
          type: "enumeration",
          events: group,
          where: "/",
          title: "Route enumeration from one client",
          detectionReason:
            `${count} requests to ${paths.size} non-existent routes from one client in the last ` +
            `${humanWindow(windowSec)} (threshold ${threshold}). Typical of an automated scanner ` +
            `mapping the application. Verified crawlers are excluded.`,
          result: "blocked",
          severityOverride: 3,
        }),
      );
    }
    return findings;
  },
};

/** Requests matching an attack signature. Classes only — never payloads. */
const injectionDetector: Detector = {
  name: "injection_pattern",
  describes: "Requests matching known injection / traversal signatures",
  run(ctx) {
    const windowSec = enumerationWindowSeconds();
    const threshold = injectionThreshold();
    const events = ofType(within(ctx, windowSec), "injection_pattern");
    const findings: Finding[] = [];

    for (const [signature, group] of groupBy(
      events,
      (e) => (e.metadata?.signature as string) ?? "unclassified",
    )) {
      const count = weight(group);
      if (count < threshold) continue;
      findings.push(
        makeFinding({
          detector: "injection_pattern",
          type: "injection_pattern",
          events: group,
          where: group[0].where,
          target: signature,
          title: `Possible ${signature.split(".")[0].toUpperCase()} pattern in requests`,
          detectionReason:
            `${count} requests matched the "${signature}" signature in the last ` +
            `${humanWindow(windowSec)} (threshold ${threshold}). The request was rejected at the ` +
            `trust boundary; this is a possible attack PATTERN, not a confirmed exploit. ` +
            `Payloads are never stored — only the signature class.`,
          result: "blocked",
        }),
      );
    }
    return findings;
  },
};

/** Repeated upload rejections — a probe of the upload validator. */
const uploadAbuseDetector: Detector = {
  name: "upload_abuse",
  describes: "Repeated rejected uploads",
  run(ctx) {
    const windowSec = uploadAbuseWindowSeconds();
    const threshold = uploadAbuseThreshold();
    const events = ofType(within(ctx, windowSec), "upload_rejected");
    const count = weight(events);
    if (count < threshold) return [];
    return [
      makeFinding({
        detector: "upload_abuse",
        type: "upload_abuse",
        events,
        where: events[0].where,
        title: "Uploads being rejected repeatedly",
        detectionReason:
          `${count} uploads rejected by MIME/size/path validation in the last ` +
          `${humanWindow(windowSec)} (threshold ${threshold}). Could be a librarian fighting a ` +
          `file format, or someone probing the validator — the incident page shows which accounts.`,
        result: "blocked",
      }),
    ];
  },
};

/**
 * Malware. Catalog threshold is "any": a single blocked infected file is an
 * incident, because the question it raises ("what else did this uploader
 * touch?") needs answering whether or not it repeats.
 */
const malwareDetector: Detector = {
  name: "malware_upload",
  describes: "A file blocked by the malware-hash check, or the scanner failing",
  run(ctx) {
    const blocked = ofType(ctx.events, "virus_scan_blocked");
    const findings: Finding[] = [];

    if (blocked.length) {
      findings.push(
        makeFinding({
          detector: "malware_upload",
          type: "malware_upload",
          events: blocked,
          where: blocked[0].where,
          service: "uploads",
          title: "Malware blocked at upload",
          detectionReason:
            `${weight(blocked)} upload(s) matched a known-malware hash on VirusTotal and were ` +
            `refused. The file did not reach storage. Confirm no earlier copy was published ` +
            `(docs/RUNBOOKS.md §I12).`,
          result: "blocked",
        }),
      );
    }

    // The scanner failing OPEN is its own problem: uploads are landing
    // unscanned and nothing else in the stack checks them.
    const failedOpen = ofType(ctx.events, "virus_scan_error", "virus_scan_skipped");
    if (weight(failedOpen) >= 3) {
      findings.push(
        makeFinding({
          detector: "malware_upload",
          type: "malware_upload",
          events: failedOpen,
          where: failedOpen[0].where,
          service: "uploads",
          title: "Malware scanning is not running",
          detectionReason:
            `${weight(failedOpen)} uploads were accepted WITHOUT a completed malware check ` +
            `(scanner error or no VIRUSTOTAL_API_KEY). The scan fails open by default, so these ` +
            `files are in storage unscanned. Set FAIL_CLOSED_VIRUS_SCAN=true to refuse instead.`,
          result: "allowed",
          severityOverride: 2,
        }),
      );
    }
    return findings;
  },
};

/** Someone guessing the cron bearer secret. Catalog threshold: any. */
const cronProbing: Detector = {
  name: "cron_secret_guessing",
  describes: "Requests to /api/cron/* with a wrong or missing secret",
  run(ctx) {
    const events = ofType(ctx.events, "cron_auth_failed");
    if (!events.length) return [];
    return [
      makeFinding({
        detector: "cron_secret_guessing",
        type: "cron_auth_failed",
        events,
        where: events[0].where,
        title: "Scheduled-job endpoint probed with a bad secret",
        detectionReason:
          `${weight(events)} request(s) to a /api/cron/* route with a wrong or missing bearer ` +
          `secret. The routes refused them. If this was not your own misconfiguration, ` +
          `rotate CRON_SECRET (docs/RUNBOOKS.md §I10).`,
        result: "blocked",
      }),
    ];
  },
};

/** The rate limiter itself failing — abuse control is running degraded. */
const limiterDegraded: Detector = {
  name: "rate_limiter_degraded",
  describes: "The database rate limiter erroring; limits on in-memory fallback",
  run(ctx) {
    // Catalog: "any sustained (2+ in 10 min)". The emitter already throttles
    // to one heartbeat per minute per process, so 2 means two minutes of it.
    const events = ofType(within(ctx, 600), "rate_limiter_degraded");
    if (events.length < 2) return [];
    return [
      makeFinding({
        detector: "rate_limiter_degraded",
        type: "rate_limiter_degraded",
        events,
        where: "lib/rate-limit",
        title: "Rate limiter degraded to in-memory fallback",
        detectionReason:
          `${events.length} degraded-limiter heartbeats in 10 minutes. The Postgres limiter is ` +
          `erroring and limits are being enforced from process memory, which undercounts across ` +
          `restarts. Usually a symptom of a database problem rather than a cause.`,
        result: "failed",
      }),
    ];
  },
};

/** An emergency lockdown switch is actively refusing requests. */
const lockdownActive: Detector = {
  name: "lockdown_active",
  describes: "An emergency lockdown switch is refusing requests",
  run(ctx) {
    const events = ofType(ctx.events, "lockdown_blocked");
    if (!events.length) return [];
    const features = new Set(events.map((e) => e.detail ?? "unknown"));
    return [
      makeFinding({
        detector: "lockdown_active",
        type: "lockdown_blocked",
        events,
        where: "lockdown",
        title: "Emergency lockdown is refusing requests",
        detectionReason:
          `${weight(events)} request(s) refused by lockdown switch(es): ${[...features].join(", ")}. ` +
          `Expected during a declared incident. If NO lockdown was declared, an environment ` +
          `variable has been set unexpectedly — treat as Sev 1.`,
        result: "blocked",
        severityOverride: 3,
      }),
    ];
  },
};

/** The in-process spike detector's meta-event, promoted to an incident. */
const spikePromoter: Detector = {
  name: "security_spike",
  describes: "One event type bursting within a single process",
  run(ctx) {
    const events = ofType(within(ctx, 3600), "security_spike");
    if (!events.length) return [];
    const kinds = new Set(events.map((e) => String(e.metadata?.spikeType ?? "unknown")));
    return [
      makeFinding({
        detector: "security_spike",
        type: "security_spike",
        events,
        where: events[0].where,
        title: `Event burst: ${[...kinds].join(", ")}`,
        detectionReason:
          `${events.length} in-process burst(s) recorded in the last hour for: ` +
          `${[...kinds].join(", ")}. The in-process detector fires at its own threshold ` +
          `(SECURITY_SPIKE_THRESHOLD) within a 60-second window.`,
        result: "blocked",
      }),
    ];
  },
};

/**
 * Baseline deviation (§25). Deliberately conservative: it only reports when a
 * baseline exists AND has enough samples AND the deviation is large. A
 * baseline computed over three quiet hours would call every normal Monday an
 * attack, so "not enough history" produces nothing rather than a guess.
 */
function describeBaseline(
  ctx: DetectionContext,
  signal: string,
  observed: number,
  windowSeconds: number,
): string {
  const baseline = ctx.baselines?.get(signal);
  if (!baseline || baseline.sampleCount < baselineMinSamples() || baseline.mean <= 0) return "";
  const perHour = (observed / windowSeconds) * 3600;
  const factor = perHour / baseline.mean;
  if (factor < baselineDeviationFactor()) return "";
  return (
    `, ${factor.toFixed(1)}× the ${baseline.sampleCount}-sample baseline of ` +
    `${baseline.mean.toFixed(1)}/h`
  );
}

/** Every detector with a real source in this deployment. */
export const DETECTORS: Detector[] = [
  bruteForce,
  credentialStuffing,
  mfaFailureSpike,
  suspiciousSuccess,
  authorizationProbing,
  privilegeEscalation,
  rateLimitStorm,
  captchaStorm,
  enumerationDetector,
  injectionDetector,
  uploadAbuseDetector,
  malwareDetector,
  cronProbing,
  limiterDegraded,
  lockdownActive,
  spikePromoter,
];

/**
 * Run every detector over one window.
 *
 * Findings are deduplicated by fingerprint, keeping the most severe (then
 * highest-risk) of each — two detectors can legitimately notice the same
 * attack (brute force and credential stuffing overlap by construction), and an
 * operator should be told once, at the higher severity.
 */
export function detect(ctx: DetectionContext): Finding[] {
  const byFingerprint = new Map<string, Finding>();

  for (const detector of DETECTORS) {
    let findings: Finding[];
    try {
      findings = detector.run(ctx);
    } catch {
      // One broken detector must not take the whole pass down: the remaining
      // detectors still protect everything they cover.
      continue;
    }
    for (const finding of findings) {
      const existing = byFingerprint.get(finding.fingerprint);
      if (!existing || outranks(finding, existing)) {
        byFingerprint.set(finding.fingerprint, finding);
      }
    }
  }

  return [...byFingerprint.values()].sort(
    (a, b) => a.severity - b.severity || Number(b.succeeded) - Number(a.succeeded) || b.riskScore - a.riskScore,
  );
}

/**
 * Which of two findings for the SAME fingerprint an operator should be told.
 * Severity first; then evidence of success, because an attack that worked
 * outranks one that was stopped; then risk. Ordering by risk alone let the
 * higher-anchored `brute_force` finding mask the `auth_anomaly` finding that
 * said the attacker got in.
 */
function outranks(candidate: Finding, incumbent: Finding): boolean {
  if (candidate.severity !== incumbent.severity) return candidate.severity < incumbent.severity;
  if (candidate.succeeded !== incumbent.succeeded) return candidate.succeeded;
  return candidate.riskScore > incumbent.riskScore;
}

// ─────────────────────────────────────────────────────────────────────────────
// Correlation & suppression (brief §9, §12)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parent → child suppression. When the parent fingerprint has a live incident,
 * the child is recorded but NOT notified — the catalog's hygiene rule 1
 * ("dependency-degraded is a child of site-down; a parent open suppresses
 * children"). Suppressing the child rather than the parent is the whole point:
 * the operator gets the cause, not three symptoms.
 */
const SUPPRESSION: { parent: string; children: RegExp[] }[] = [
  {
    parent: "site_down:production",
    children: [/^dependency_degraded:/, /^rate_limiter_degraded:/, /^abuse:/, /^rate_limit_storm:/],
  },
  {
    parent: "dependency_degraded:production",
    children: [/^rate_limiter_degraded:/],
  },
  {
    // An authentication attack in progress explains the authorization
    // refusals that follow it; do not page twice for one campaign.
    parent: "auth_attack:admin",
    children: [/^auth_attack:public$/],
  },
];

/**
 * Which live incident (by fingerprint) should suppress notification for this
 * finding, if any. Pure: the caller supplies the set of live fingerprints.
 */
export function suppressorFor(
  fingerprint: string,
  liveFingerprints: ReadonlySet<string>,
): string | null {
  for (const rule of SUPPRESSION) {
    if (!liveFingerprints.has(rule.parent)) continue;
    if (rule.parent === fingerprint) continue;
    if (rule.children.some((re) => re.test(fingerprint))) return rule.parent;
  }
  return null;
}

/**
 * Correlate findings into an attack narrative: findings that share a client
 * hash or a time window and belong to the reconnaissance → probing →
 * exploitation progression are reported as one story rather than five alerts.
 *
 * Returns the fingerprint of the finding that should be the PARENT, or null
 * when the findings are genuinely unrelated. Kept separate from `detect()` so
 * a correlation bug can never suppress a detection.
 */
export function correlate(findings: Finding[]): Map<string, string> {
  const parentOf = new Map<string, string>();
  if (findings.length < 2) return parentOf;

  // Severity order is already the caller's sort; the most severe finding in an
  // overlapping time window is the head of the narrative.
  const sorted = [...findings].sort((a, b) => a.severity - b.severity || a.firstSeen - b.firstSeen);
  const head = sorted[0];

  for (const finding of sorted.slice(1)) {
    if (finding.fingerprint === head.fingerprint) continue;
    // Overlapping in time with the head, and one step "below" it in severity.
    const overlaps = finding.firstSeen <= head.lastSeen && finding.lastSeen >= head.firstSeen;
    const weaker = finding.severity >= head.severity;
    if (overlaps && weaker) parentOf.set(finding.fingerprint, head.fingerprint);
  }
  return parentOf;
}
