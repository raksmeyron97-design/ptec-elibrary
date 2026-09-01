import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildIncidentMessage,
  buildPipelineDegradedMessage,
  buildRecoveryMessage,
  checkSafeForTelegram,
  clampToTelegramLimit,
  escapeAttribute,
  escapeHtml,
  formatDuration,
  humanType,
  redactForTelegram,
  SEVERITY_TAGS,
  TELEGRAM_MAX_LENGTH,
  timestamps,
} from "./format";
import type { Severity } from "../model";
import {
  FAKE_EMAIL,
  FAKE_GITHUB_TOKEN,
  FAKE_GOOGLE_KEY,
  FAKE_JWT,
  FAKE_PUBLIC_IP,
  FAKE_SUPABASE_KEY,
  FAKE_TELEGRAM_TOKEN,
} from "../secret-fixtures";

const FIRST_SEEN = new Date("2026-08-31T14:47:00.000Z");
const LAST_SEEN = new Date("2026-08-31T14:55:41.000Z");

function alert(overrides: Partial<Parameters<typeof buildIncidentMessage>[0]> = {}) {
  return buildIncidentMessage({
    reference: "SEC-20260831-021",
    severity: 1,
    type: "privilege_escalation",
    title: "Role granted: reader → super_admin",
    category: "privilege",
    service: "admin",
    riskScore: 92,
    status: "open",
    eventCount: 7,
    firstSeen: FIRST_SEEN,
    lastSeen: LAST_SEEN,
    detectionReason:
      'An account was granted the "super_admin" role (previous role: "reader"). Acknowledge it if it was expected.',
    runbook: "docs/RUNBOOKS.md §I9",
    baseUrl: "https://library.ptec.edu.kh",
    ...overrides,
  });
}

describe("alert message", () => {
  it("carries every field an operator needs to triage from a phone", () => {
    const msg = alert();
    expect(msg).toContain("🚨 SEV 1 — SECURITY INCIDENT");
    expect(msg).toContain("SEC-20260831-021");
    expect(msg).toContain("Privilege escalation");
    expect(msg).toContain("92/100");
    expect(msg).toContain("Events</b> 7");
    expect(msg).toContain("OPEN");
    expect(msg).toContain("docs/RUNBOOKS.md §I9");
    expect(msg).toContain("https://library.ptec.edu.kh/admin/security/incidents/SEC-20260831-021");
  });

  it("shows Phnom Penh local time beside UTC", () => {
    const msg = alert();
    expect(msg).toContain("Phnom Penh");
    expect(msg).toContain("UTC");
    expect(msg).toContain("2026-08-31 14:47:00 UTC");
    expect(msg).toContain("21:47"); // UTC+7
  });

  it("tells the responder what the severity obliges them to do", () => {
    expect(alert({ severity: 1 })).toContain("act immediately, any hour");
    expect(alert({ severity: 2 })).toContain("same working day");
  });

  it("marks an escalation as such rather than repeating the original", () => {
    const msg = alert({ escalatedFrom: 2 as Severity });
    expect(msg).toContain("SECURITY INCIDENT ESCALATED");
    expect(msg).toContain("Sev 2 → Sev 1");
  });

  it("reproduces the detector's evidence verbatim", () => {
    expect(alert()).toContain('granted the "super_admin" role');
  });

  it("escapes HTML so a route or title cannot break the message", () => {
    const msg = alert({ title: "<b>pwn</b> & <script>" });
    expect(msg).toContain("&lt;b&gt;pwn&lt;/b&gt; &amp; &lt;script&gt;");
    expect(msg).not.toContain("<script>");
  });

  it("omits the runbook line when there is none rather than printing 'null'", () => {
    const msg = alert({ runbook: null });
    expect(msg).not.toContain("Runbook");
    expect(msg).not.toContain("null");
  });

  it("stays within Telegram's message limit for realistic input", () => {
    expect(alert().length).toBeLessThan(TELEGRAM_MAX_LENGTH);
  });
});

describe("recovery message", () => {
  const recovery = buildRecoveryMessage({
    reference: "SEC-20260831-021",
    severity: 2,
    type: "brute_force",
    title: "Authentication attack pattern on one account",
    eventCount: 37,
    firstSeen: FIRST_SEEN,
    recoveredAt: LAST_SEEN,
    baseUrl: "https://library.ptec.edu.kh",
  });

  it("reports duration, count and the incident reference", () => {
    expect(recovery).toContain("✅ SECURITY INCIDENT RECOVERED");
    expect(recovery).toContain("SEC-20260831-021");
    expect(recovery).toContain("8m 41s");
    expect(recovery).toContain("Events</b> 37");
  });

  it("claims only what quiet actually proves (§42)", () => {
    expect(recovery).toContain("No further events");
    expect(recovery).toContain("not a claim that it was blocked or remediated");
    expect(recovery).not.toMatch(/threat neutrali|attack prevented|system is secure/i);
  });
});

describe("pipeline-degraded message", () => {
  it("says detection still works and only delivery is broken", () => {
    const msg = buildPipelineDegradedMessage({
      eventsAffected: 17,
      deliveryFailures: 17,
      fallback: "GitHub email",
      baseUrl: "https://library.ptec.edu.kh",
    });
    expect(msg).toContain("⚠️ SEV 2 — ALERT PIPELINE DEGRADED");
    expect(msg).toContain("17");
    expect(msg).toContain("Detection and recording are working");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The privacy contract. These are the tests that matter most in this file.
// ─────────────────────────────────────────────────────────────────────────────

describe("privacy gate", () => {
  // Fixtures come from `../secret-fixtures`, which assembles them at runtime:
  // a fake Google key is shaped exactly like a real one, so writing it as a
  // literal here made CI's gitleaks job fail on this branch.
  const LEAKS: [string, string][] = [
    ["a JWT", `token ${FAKE_JWT}`],
    ["a Supabase key", FAKE_SUPABASE_KEY],
    ["a Google API key", FAKE_GOOGLE_KEY],
    ["a GitHub token", FAKE_GITHUB_TOKEN],
    ["a Telegram bot token", FAKE_TELEGRAM_TOKEN],
    ["an email address", `${FAKE_EMAIL} tried to sign in`],
    ["a labelled credential", "password: hunter2"],
    ["a raw IP address", `from ${FAKE_PUBLIC_IP}`],
    ["an attack payload", "matched <script>alert(1)</script>"],
  ];

  it.each(LEAKS)("refuses to pass %s", (label, text) => {
    const verdict = checkSafeForTelegram(text);
    expect(verdict.safe).toBe(false);
    expect(verdict.violation).toBe(label);
  });

  it("allows a normal alert through", () => {
    expect(checkSafeForTelegram(alert()).safe).toBe(true);
  });

  it("allows a recovery message through", () => {
    const msg = buildRecoveryMessage({
      reference: "SEC-1",
      severity: 2,
      type: "brute_force",
      title: "Authentication attack pattern",
      eventCount: 37,
      firstSeen: FIRST_SEEN,
      recoveredAt: LAST_SEEN,
      baseUrl: "https://library.ptec.edu.kh",
    });
    expect(checkSafeForTelegram(msg).safe).toBe(true);
  });

  it("allows private addresses — SSRF signature names contain them and they carry no PII", () => {
    expect(checkSafeForTelegram("signature ssrf.internal_host (169.254.169.254)").safe).toBe(true);
    expect(checkSafeForTelegram("127.0.0.1 probe").safe).toBe(true);
  });

  it("redacts rather than refusing — an undelivered alert is worse than a redacted one", () => {
    const { text, redacted } = redactForTelegram(
      `login failed for ${FAKE_EMAIL} from ${FAKE_PUBLIC_IP}`,
    );
    expect(text).not.toContain(FAKE_EMAIL);
    expect(text).not.toContain(FAKE_PUBLIC_IP);
    expect(text).toContain("[redacted]");
    expect(redacted).toContain("an email address");
    expect(redacted).toContain("a raw IP address");
  });

  it("a redacted message then passes the gate", () => {
    const { text } = redactForTelegram(`password: hunter2 for ${FAKE_EMAIL}`);
    expect(checkSafeForTelegram(text).safe).toBe(true);
  });

  it("never leaks a real detector's output — end to end", () => {
    // The exact string the brute-force detector produces, checked against the
    // gate. This is the pairing that actually protects production.
    const msg = alert({
      type: "brute_force",
      title: "Authentication attack pattern on one account",
      detectionReason:
        "12 failed sign-in attempts against a single account in the last 15 min (threshold 10). Account identifier withheld from the alert; see the incident page.",
    });
    expect(checkSafeForTelegram(msg).safe).toBe(true);
    expect(msg).not.toMatch(/@/);
  });
});

describe("formatting helpers", () => {
  it("formats durations the way the runbooks read", () => {
    expect(formatDuration(41_000)).toBe("41s");
    expect(formatDuration(521_000)).toBe("8m 41s");
    expect(formatDuration(3_600_000 * 3 + 60_000 * 12)).toBe("3h 12m");
    expect(formatDuration(86_400_000 * 2)).toBe("2d 0h");
    expect(formatDuration(-5)).toBe("0s");
  });

  it("humanizes event types", () => {
    expect(humanType("privilege_escalation")).toBe("Privilege escalation");
    expect(humanType("brute_force")).toBe("Brute force");
  });

  it("escapes only what Telegram's HTML mode requires, for TEXT", () => {
    expect(escapeHtml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d "e"');
  });

  it("escapes quotes as well for ATTRIBUTE values", () => {
    // Text escaping leaves `"` intact, which closes an href early and turns
    // everything after it into markup. CodeQL flagged the three <a href>
    // sites for exactly this.
    expect(escapeAttribute('a & b < c > d "e" \'f\'')).toBe(
      "a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;",
    );
  });

  it("a quote in the base URL cannot break out of the href", () => {
    const msg = alert({ baseUrl: 'https://library.ptec.edu.kh"onmouseover="alert(1)' });
    expect(msg).not.toMatch(/href="[^"]*"\s*onmouseover/);
    expect(msg).toContain("&quot;");
  });

  it("clamps an over-long message rather than letting Telegram reject it", () => {
    const clamped = clampToTelegramLimit("x".repeat(10_000));
    expect(clamped.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
    expect(clamped).toContain("truncated");
  });

  it("leaves a normal message untouched", () => {
    expect(clampToTelegramLimit("short")).toBe("short");
  });

  it("timestamps are stable and dual-zone", () => {
    expect(timestamps(new Date("2026-01-01T00:00:00Z"))).toBe(
      "01/01/2026, 07:00 Phnom Penh · 2026-01-01 00:00:00 UTC",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("parity with scripts/ops/alert-telegram.mjs", () => {
  // The CLI stays the transport for box jobs and GitHub Actions, which cannot
  // import TypeScript. It is not a second alert system, but it IS a second
  // copy of the severity vocabulary — so this test reads its source and fails
  // if the two ever disagree about what "SEV 1" looks like.
  const source = readFileSync(
    join(process.cwd(), "scripts/ops/alert-telegram.mjs"),
    "utf8",
  );

  it("uses the same severity tags", () => {
    for (const [severity, tag] of Object.entries(SEVERITY_TAGS)) {
      expect(source, `severity ${severity} tag "${tag}" missing from the CLI`).toContain(tag);
    }
  });

  it("uses the same HTML escaping and the same three entities", () => {
    expect(source).toContain('replace(/&/g, "&amp;")');
    expect(source).toContain('replace(/</g, "&lt;")');
    expect(source).toContain('replace(/>/g, "&gt;")');
  });

  it("reports Phnom Penh local time like this module does", () => {
    expect(source).toContain("Asia/Phnom_Penh");
  });

  it("uses HTML parse mode, not Markdown", () => {
    expect(source).toContain('parse_mode: "HTML"');
  });
});
