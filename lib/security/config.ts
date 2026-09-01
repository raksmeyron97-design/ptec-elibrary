/**
 * Every tunable number the security monitoring system uses, in one place.
 *
 * Same shape as `lib/rate-limit-policy.ts`: each value is a FUNCTION reading
 * `process.env` at call time, so an operator can retune a threshold during an
 * incident by setting a variable and restarting the container — no code change,
 * no deploy of new logic — and so tests can vary a threshold without module
 * reloading tricks.
 *
 * Defaults come from docs/ALERT-CATALOG.md wherever the catalog states one.
 * Where it does not, the default is chosen to satisfy hygiene rule 4 ("no
 * per-user-error alerts"): a single occurrence must never cross a threshold.
 *
 * Every variable here is documented in docs/SECURITY-MONITORING.md §Configuration
 * and in .env.example. Adding one without documenting it is a bug.
 */

function envInt(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function envNum(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1" || raw === "on";
}

// ── Detection pass ──────────────────────────────────────────────────────────

/**
 * How far back each detection pass looks. Must comfortably exceed the cron
 * interval so a pass never has a blind spot between runs; 60 min against a
 * 5-minute schedule gives 12× overlap, and re-counting the same events is
 * harmless because incidents dedupe on fingerprint.
 */
export const detectionLookbackMinutes = () => envInt("SECURITY_DETECT_LOOKBACK_MINUTES", 60);

/** Hard cap on rows a single pass will load. Bounds memory under a flood. */
export const detectionMaxEvents = () => envInt("SECURITY_DETECT_MAX_EVENTS", 20_000);

// ── Authentication (decision D1 — these detectors only work because password
// sign-in is proxied server-side; before that there was no signal at all) ────

/** Window for counting authentication failures, in seconds. */
export const authAttackWindowSeconds = () => envInt("AUTH_ATTACK_WINDOW_SECONDS", 900);

/** Failures against ONE account inside the window → brute force. */
export const authAttackThreshold = () => envInt("AUTH_ATTACK_THRESHOLD", 10);

/** Distinct accounts attacked from one client hash → credential stuffing. */
export const credentialStuffingAccounts = () => envInt("CREDENTIAL_STUFFING_ACCOUNTS", 5);

/** Rejected TOTP verifications inside the window → MFA failure spike. */
export const mfaFailureThreshold = () => envInt("MFA_FAILURE_THRESHOLD", 5);

/**
 * Failures that must precede a success for it to read as "suspicious login".
 * A person who mistypes twice and then gets in is not an incident.
 */
export const suspiciousSuccessAfterFailures = () => envInt("AUTH_SUSPICIOUS_SUCCESS_AFTER", 8);

/**
 * Catalog `admin-auth-anomaly`: "> 10/h one user or IP". Counts
 * auth_forbidden + mfa_required, i.e. an already-authenticated principal
 * probing above its privilege — NOT password guessing.
 */
export const adminAuthAnomalyThreshold = () => envInt("ADMIN_AUTH_ANOMALY_THRESHOLD", 10);
export const adminAuthAnomalyWindowSeconds = () => envInt("ADMIN_AUTH_ANOMALY_WINDOW_SECONDS", 3600);

// ── Abuse ───────────────────────────────────────────────────────────────────

/** Catalog `rate-limit-storm`: "> 100/h". */
export const rateLimitAlertThreshold = () => envInt("RATE_LIMIT_ALERT_THRESHOLD", 100);
export const rateLimitAlertWindowSeconds = () => envInt("RATE_LIMIT_ALERT_WINDOW_SECONDS", 3600);

/** Catalog `captcha-storm`: "> 50/h". */
export const captchaStormThreshold = () => envInt("CAPTCHA_STORM_THRESHOLD", 50);

/** Rate limits hit specifically on file/download routes → download abuse. */
export const downloadAbuseThreshold = () => envInt("DOWNLOAD_ABUSE_THRESHOLD", 60);

/** Unknown-route probes from one client inside the window → enumeration. */
export const enumerationThreshold = () => envInt("ENUMERATION_THRESHOLD", 25);
export const enumerationWindowSeconds = () => envInt("ENUMERATION_WINDOW_SECONDS", 600);

/**
 * Requests matching an attack signature before an incident opens. Set above 1
 * on purpose: signature regexes have false positives (a library search for
 * "UNION SELECT" in a database textbook is legitimate), so one match is
 * dashboard data and a pattern of matches is an incident.
 */
export const injectionThreshold = () => envInt("INJECTION_THRESHOLD", 3);

/** Rejected uploads inside the window → upload abuse. */
export const uploadAbuseThreshold = () => envInt("UPLOAD_ABUSE_THRESHOLD", 10);
export const uploadAbuseWindowSeconds = () => envInt("UPLOAD_ABUSE_WINDOW_SECONDS", 3600);

/** Catalog `waf-spike`: "10× baseline". Unused until a source exists (D3). */
export const wafSpikeThreshold = () => envNum("WAF_SPIKE_THRESHOLD", 10);

// ── Baselines (§25) ─────────────────────────────────────────────────────────

/** Multiple of baseline that counts as a deviation worth reporting. */
export const baselineDeviationFactor = () => envNum("BASELINE_DEVIATION_FACTOR", 5, 1.5);

/**
 * Minimum samples before a baseline may be used at all. Below this the
 * detectors fall back to fixed thresholds: a baseline computed from three
 * quiet hours declares every normal Monday an attack.
 */
export const baselineMinSamples = () => envInt("BASELINE_MIN_SAMPLES", 24);

/** Days of history a baseline is computed over. */
export const baselineWindowDays = () => envInt("BASELINE_WINDOW_DAYS", 14);

// ── Incidents & alerting ────────────────────────────────────────────────────

/**
 * How long after `last_seen` an open incident with no new events is considered
 * recovered. This is what produces exactly one recovery message per incident.
 * 30 min is long enough that a lull mid-attack does not declare victory early.
 */
export const incidentRecoveryQuietSeconds = () => envInt("INCIDENT_RECOVERY_QUIET_SECONDS", 1800);

/**
 * Events sharing a fingerprint inside this window attach to the SAME incident
 * rather than opening a new one. Longer than the recovery quiet period would
 * be contradictory, so it is clamped below it.
 */
export const incidentDedupeWindowSeconds = () =>
  Math.min(envInt("INCIDENT_DEDUPE_WINDOW_SECONDS", 900), incidentRecoveryQuietSeconds());

/**
 * Minimum gap between notifications for ONE incident. The first detection
 * always alerts; after that an incident may only re-alert on ESCALATION
 * (severity rising), and not more often than this.
 */
export const alertCooldownSeconds = () => envInt("ALERT_COOLDOWN_SECONDS", 3600);

/**
 * Only incidents at or below this severity number are pushed to Telegram.
 * Default 2 implements the catalog's delivery policy exactly: Sev 1 and Sev 2
 * page; Sev 3/4 stay on the dashboard. Raising this to 3 is how you make
 * Telegram noisy, which is why it is one variable and not scattered checks.
 */
export const telegramMinSeverity = () => envInt("SECURITY_ALERT_MIN_SEVERITY", 2, 1);

/** Master switch: turn off all outbound security alerting (maintenance). */
export const alertingEnabled = () => envBool("SECURITY_ALERTING_ENABLED", true);

/** Bounded retries for one alert delivery before it is recorded as failed. */
export const alertMaxAttempts = () => envInt("SECURITY_ALERT_MAX_ATTEMPTS", 3);

/**
 * Consecutive delivery failures before the pipeline reports ITSELF as degraded
 * (§41). Below this, a single blip is not worth a meta-alert.
 */
export const alertPipelineFailureThreshold = () => envInt("ALERT_PIPELINE_FAILURE_THRESHOLD", 3);

// ── Retention ───────────────────────────────────────────────────────────────

export const securityEventRetentionDays = () => envInt("SECURITY_EVENT_RETENTION_DAYS", 180);
export const alertDeliveryRetentionDays = () => envInt("ALERT_DELIVERY_RETENTION_DAYS", 180);
export const baselineRetentionDays = () => envInt("SECURITY_BASELINE_RETENTION_DAYS", 90);

/**
 * Snapshot of the whole configuration, for the admin dashboard's "why did this
 * fire?" panel and for the docs parity test. Values only — no secrets.
 */
export function securityConfigSnapshot(): Record<string, number | boolean> {
  return {
    detectionLookbackMinutes: detectionLookbackMinutes(),
    detectionMaxEvents: detectionMaxEvents(),
    authAttackWindowSeconds: authAttackWindowSeconds(),
    authAttackThreshold: authAttackThreshold(),
    credentialStuffingAccounts: credentialStuffingAccounts(),
    mfaFailureThreshold: mfaFailureThreshold(),
    suspiciousSuccessAfterFailures: suspiciousSuccessAfterFailures(),
    adminAuthAnomalyThreshold: adminAuthAnomalyThreshold(),
    adminAuthAnomalyWindowSeconds: adminAuthAnomalyWindowSeconds(),
    rateLimitAlertThreshold: rateLimitAlertThreshold(),
    rateLimitAlertWindowSeconds: rateLimitAlertWindowSeconds(),
    captchaStormThreshold: captchaStormThreshold(),
    downloadAbuseThreshold: downloadAbuseThreshold(),
    enumerationThreshold: enumerationThreshold(),
    enumerationWindowSeconds: enumerationWindowSeconds(),
    injectionThreshold: injectionThreshold(),
    uploadAbuseThreshold: uploadAbuseThreshold(),
    uploadAbuseWindowSeconds: uploadAbuseWindowSeconds(),
    wafSpikeThreshold: wafSpikeThreshold(),
    baselineDeviationFactor: baselineDeviationFactor(),
    baselineMinSamples: baselineMinSamples(),
    baselineWindowDays: baselineWindowDays(),
    incidentRecoveryQuietSeconds: incidentRecoveryQuietSeconds(),
    incidentDedupeWindowSeconds: incidentDedupeWindowSeconds(),
    alertCooldownSeconds: alertCooldownSeconds(),
    telegramMinSeverity: telegramMinSeverity(),
    alertingEnabled: alertingEnabled(),
    alertMaxAttempts: alertMaxAttempts(),
    alertPipelineFailureThreshold: alertPipelineFailureThreshold(),
    securityEventRetentionDays: securityEventRetentionDays(),
    alertDeliveryRetentionDays: alertDeliveryRetentionDays(),
    baselineRetentionDays: baselineRetentionDays(),
  };
}
