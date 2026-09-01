import { describe, it, expect } from "vitest";
import {
  correlate,
  detect,
  DETECTORS,
  runbookFor,
  suppressorFor,
  type Baseline,
  type DetectionContext,
  type SecurityEventRecord,
} from "./detect";
import type { SecurityEventType } from "./model";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");

let nextId = 1;

function event(
  type: SecurityEventType,
  overrides: Partial<SecurityEventRecord> = {},
): SecurityEventRecord {
  return {
    id: nextId++,
    type,
    severity: 4,
    riskScore: 10,
    service: "app",
    where: "/api/x",
    actorType: "anonymous",
    actorId: null,
    target: null,
    result: "blocked",
    detail: null,
    requestId: null,
    ipHash: null,
    count: 1,
    fingerprint: `${type}:/api/x`,
    metadata: {},
    occurredAt: NOW - 60_000,
    ...overrides,
  };
}

function ctx(events: SecurityEventRecord[], baselines?: Map<string, Baseline>): DetectionContext {
  return { now: NOW, events, baselines };
}

function repeat(n: number, make: (i: number) => SecurityEventRecord): SecurityEventRecord[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

// ─────────────────────────────────────────────────────────────────────────────
// The anti-false-positive contract. These come FIRST because they are the
// property that decides whether anyone still reads the alerts in a month.
// ─────────────────────────────────────────────────────────────────────────────

describe("false-positive control (catalog hygiene rule 4)", () => {
  it("one failed login produces nothing", () => {
    expect(detect(ctx([event("login_failed", { target: "u1", where: "/auth/login" })]))).toEqual([]);
  });

  it("one rate limit produces nothing", () => {
    expect(detect(ctx([event("rate_limited")]))).toEqual([]);
  });

  it("one captcha failure produces nothing", () => {
    expect(detect(ctx([event("captcha_failed")]))).toEqual([]);
  });

  it("one rejected upload produces nothing", () => {
    expect(detect(ctx([event("upload_rejected")]))).toEqual([]);
  });

  it("one 404 produces nothing", () => {
    expect(detect(ctx([event("enumeration")]))).toEqual([]);
  });

  it("one signature match produces nothing — these regexes have false positives", () => {
    const findings = detect(
      ctx([event("injection_pattern", { metadata: { signature: "sqli.union" } })]),
    );
    expect(findings).toEqual([]);
  });

  it("a single degraded-limiter blip produces nothing", () => {
    expect(detect(ctx([event("rate_limiter_degraded")]))).toEqual([]);
  });

  it("an empty window produces nothing and does not throw", () => {
    expect(detect(ctx([]))).toEqual([]);
  });

  it("a user mistyping their password a few times is not an incident", () => {
    const events = repeat(4, (i) =>
      event("login_failed", { target: "u1", where: "/auth/login", occurredAt: NOW - i * 5_000 }),
    );
    expect(detect(ctx(events))).toEqual([]);
  });

  it("a user who mistypes twice and then signs in is not an incident", () => {
    const events = [
      ...repeat(2, (i) => event("login_failed", { target: "u1", occurredAt: NOW - 20_000 - i })),
      event("login_succeeded", { target: "u1", result: "success", occurredAt: NOW - 5_000 }),
    ];
    expect(detect(ctx(events))).toEqual([]);
  });

  it("verified crawler traffic never triggers a volume detector", () => {
    const crawler = repeat(500, () =>
      event("rate_limited", { metadata: { crawler: "verified" }, fingerprint: "rate_limited:/books" }),
    );
    expect(detect(ctx(crawler))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("brute force", () => {
  it("opens one incident once the threshold is crossed", () => {
    const events = repeat(12, (i) =>
      event("login_failed", { target: "u1", where: "/auth/login", occurredAt: NOW - i * 10_000 }),
    );
    const findings = detect(ctx(events));
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("brute_force");
    expect(findings[0].detectionReason).toContain("12 failed sign-in attempts");
    expect(findings[0].detectionReason).toContain("threshold 10");
  });

  it("collapses ONE attack into ONE finding, not one per event", () => {
    const events = repeat(300, (i) =>
      event("login_failed", { target: "u1", where: "/auth/login", occurredAt: NOW - i * 1_000 }),
    );
    const findings = detect(ctx(events));
    expect(findings.filter((f) => f.category === "auth_attack")).toHaveLength(1);
  });

  it("never names the attacked account in the alert text", () => {
    const events = repeat(12, () =>
      event("login_failed", { target: "director@ptec.edu.kh", where: "/auth/login" }),
    );
    const [finding] = detect(ctx(events));
    expect(finding.detectionReason).not.toContain("director@ptec.edu.kh");
    expect(finding.detectionReason).toContain("withheld");
  });

  it("treats the admin login as a higher-severity surface", () => {
    const pub = detect(
      ctx(repeat(12, () => event("login_failed", { target: "u1", where: "/auth/login" }))),
    )[0];
    const adm = detect(
      ctx(repeat(12, () => event("login_failed", { target: "u1", where: "/admin/login" }))),
    )[0];
    expect(adm.type).toBe("admin_auth_anomaly");
    expect(adm.severity).toBeLessThanOrEqual(pub.severity);
    expect(adm.fingerprint).toBe("auth_attack:admin");
    expect(pub.fingerprint).toBe("auth_attack:public");
  });

  it("ignores failures older than the window", () => {
    const stale = repeat(30, () =>
      event("login_failed", { target: "u1", occurredAt: NOW - 2 * 3600 * 1000 }),
    );
    expect(detect(ctx(stale))).toEqual([]);
  });
});

describe("credential stuffing", () => {
  it("fires on many accounts from one client, below the per-account threshold", () => {
    // 2 failures each against 8 accounts: no single account reaches the
    // brute-force threshold, but the pattern is unmistakable.
    const events = repeat(16, (i) =>
      event("login_failed", {
        target: `user${Math.floor(i / 2)}`,
        ipHash: "client-a",
        where: "/auth/login",
        occurredAt: NOW - i * 5_000,
      }),
    );
    const findings = detect(ctx(events));
    const stuffing = findings.find((f) => f.type === "credential_stuffing");
    expect(stuffing).toBeDefined();
    expect(stuffing!.detectionReason).toContain("8 distinct accounts");
  });

  it("does not fire when the same few accounts are retried", () => {
    const events = repeat(16, (i) =>
      event("login_failed", { target: `user${i % 2}`, ipHash: "client-a" }),
    );
    expect(detect(ctx(events)).some((f) => f.type === "credential_stuffing")).toBe(false);
  });

  it("says the client is identified by a hash, not an address", () => {
    const events = repeat(16, (i) =>
      event("login_failed", { target: `user${i}`, ipHash: "client-a" }),
    );
    const stuffing = detect(ctx(events)).find((f) => f.type === "credential_stuffing")!;
    expect(stuffing.detectionReason).toContain("daily-rotating hash");
  });
});

describe("successful login after failures", () => {
  it("is the highest-severity authentication finding — a possible breach", () => {
    const events = [
      ...repeat(10, (i) => event("login_failed", { target: "u1", where: "/admin/login", occurredAt: NOW - 60_000 - i * 1_000 })),
      event("login_succeeded", { target: "u1", where: "/admin/login", result: "success", occurredAt: NOW - 10_000 }),
    ];
    const findings = detect(ctx(events));
    const breach = findings.find((f) => f.detector === "auth_success_after_failures");
    expect(breach).toBeDefined();
    expect(breach!.severity).toBe(1);
  });

  it("states the innocent explanation as well as the alarming one", () => {
    const events = [
      ...repeat(10, () => event("login_failed", { target: "u1", occurredAt: NOW - 60_000 })),
      event("login_succeeded", { target: "u1", result: "success", occurredAt: NOW - 10_000 }),
    ];
    const breach = detect(ctx(events)).find((f) => f.detector === "auth_success_after_failures")!;
    expect(breach.detectionReason).toContain("legitimate user who recovered their password");
    expect(breach.detectionReason).toContain("possible compromise");
  });

  it("ignores a success that PRECEDED the failures", () => {
    const events = [
      event("login_succeeded", { target: "u1", result: "success", occurredAt: NOW - 600_000 }),
      ...repeat(10, (i) => event("login_failed", { target: "u1", occurredAt: NOW - 60_000 + i })),
    ];
    expect(detect(ctx(events)).some((f) => f.detector === "auth_success_after_failures")).toBe(false);
  });

  it("is NOT masked by the brute-force finding for the same surface", () => {
    // Regression: both detectors produce fingerprint auth_attack:public at
    // Sev 2, and de-duplication by risk score alone kept `brute_force`
    // (higher anchor) — so "someone got in" was reported as "someone tried".
    // Evidence of success now outranks evidence of blocked attempts.
    const events = [
      ...repeat(12, (i) => event("login_failed", { target: "u1", where: "/auth/login", occurredAt: NOW - 60_000 - i })),
      event("login_succeeded", { target: "u1", where: "/auth/login", result: "success", occurredAt: NOW - 5_000 }),
    ];
    const findings = detect(ctx(events));
    const onSurface = findings.filter((f) => f.fingerprint === "auth_attack:public");
    expect(onSurface).toHaveLength(1);
    expect(onSurface[0].detector).toBe("auth_success_after_failures");
    expect(onSurface[0].succeeded).toBe(true);
  });

  it("does not attribute one account's failures to another account's success", () => {
    const events = [
      ...repeat(10, () => event("login_failed", { target: "victim", occurredAt: NOW - 60_000 })),
      event("login_succeeded", { target: "someone-else", result: "success", occurredAt: NOW - 5_000 }),
    ];
    expect(detect(ctx(events)).some((f) => f.detector === "auth_success_after_failures")).toBe(false);
  });
});

describe("privilege escalation", () => {
  it("opens a Sev 1 incident for a super_admin grant", () => {
    const findings = detect(
      ctx([
        event("privilege_change", {
          where: "setUserRole",
          result: "success",
          metadata: { from: "reader", to: "super_admin", targetUserId: "u-9" },
        }),
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("privilege_escalation");
    expect(findings[0].severity).toBe(1);
    expect(findings[0].fingerprint).toBe("privilege:u-9");
    expect(findings[0].runbook).toBe("docs/RUNBOOKS.md §I9");
  });

  it("opens a Sev 2 incident for an admin grant", () => {
    const [finding] = detect(
      ctx([
        event("privilege_change", {
          where: "setUserRole",
          result: "success",
          metadata: { from: "librarian", to: "admin", targetUserId: "u-3" },
        }),
      ]),
    );
    expect(finding.severity).toBe(2);
  });

  it("ignores routine, non-administrative role changes", () => {
    expect(
      detect(
        ctx([
          event("privilege_change", {
            metadata: { from: "reader", to: "staff", targetUserId: "u-1" },
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("does not claim the change was unauthorized — only that it needs review", () => {
    const [finding] = detect(
      ctx([
        event("privilege_change", {
          result: "success",
          metadata: { from: "reader", to: "admin", targetUserId: "u-4" },
        }),
      ]),
    );
    expect(finding.detectionReason).toContain("not a claim that it was unauthorized");
  });

  it("scopes the incident to the principal, so two grants are two incidents", () => {
    const findings = detect(
      ctx([
        event("privilege_change", { result: "success", metadata: { from: "reader", to: "admin", targetUserId: "a" } }),
        event("privilege_change", { result: "success", metadata: { from: "reader", to: "admin", targetUserId: "b" } }),
      ]),
    );
    expect(new Set(findings.map((f) => f.fingerprint)).size).toBe(2);
  });
});

describe("abuse detectors", () => {
  it("rate-limit storm fires at the catalog threshold of 100/h", () => {
    const events = repeat(120, () =>
      event("rate_limited", { where: "/api/search", service: "search", fingerprint: "rate_limited:/api/search" }),
    );
    const [finding] = detect(ctx(events));
    expect(finding.type).toBe("rate_limit_storm");
    expect(finding.detectionReason).toContain("120 rate-limit refusals");
    expect(finding.detectionReason).toContain("Verified crawlers are excluded");
  });

  it("classifies rate limits on delivery routes as download abuse", () => {
    const events = repeat(80, () =>
      event("rate_limited", {
        where: "/api/books/[slug]/download",
        service: "delivery",
        fingerprint: "rate_limited:/api/books/:id/download",
      }),
    );
    const [finding] = detect(ctx(events));
    expect(finding.type).toBe("download_abuse");
  });

  it("captcha storm fires at the catalog threshold of 50/h", () => {
    const events = repeat(60, () => event("captcha_failed", { where: "/api/contact" }));
    const [finding] = detect(ctx(events));
    expect(finding.type).toBe("captcha_storm");
    expect(finding.detectionReason).toContain("the CAPTCHA is doing its job");
  });

  it("enumeration groups by client and reports how many distinct paths were probed", () => {
    const events = repeat(30, (i) =>
      event("enumeration", { ipHash: "scanner-1", where: `/probe-${i}` }),
    );
    const [finding] = detect(ctx(events));
    expect(finding.type).toBe("enumeration");
    expect(finding.detectionReason).toContain("30 non-existent routes");
  });

  it("does not merge enumeration from two different clients", () => {
    const events = [
      ...repeat(20, (i) => event("enumeration", { ipHash: "a", where: `/p${i}` })),
      ...repeat(20, (i) => event("enumeration", { ipHash: "b", where: `/q${i}` })),
    ];
    // Neither client alone crosses 25.
    expect(detect(ctx(events)).some((f) => f.type === "enumeration")).toBe(false);
  });
});

describe("injection signatures", () => {
  it("fires once a signature class repeats", () => {
    const events = repeat(5, () =>
      event("injection_pattern", { metadata: { signature: "sqli.union" }, where: "/api/search" }),
    );
    const [finding] = detect(ctx(events));
    expect(finding.type).toBe("injection_pattern");
    expect(finding.title).toContain("Possible SQLI pattern");
  });

  it("says 'possible pattern', never 'attack prevented' (§42)", () => {
    const events = repeat(5, () => event("injection_pattern", { metadata: { signature: "xss.script" } }));
    const [finding] = detect(ctx(events));
    expect(finding.detectionReason).toContain("possible attack PATTERN");
    expect(finding.detectionReason).toContain("not a confirmed exploit");
  });

  it("states that payloads are never stored", () => {
    const events = repeat(5, () => event("injection_pattern", { metadata: { signature: "sqli.union" } }));
    expect(detect(ctx(events))[0].detectionReason).toContain("Payloads are never stored");
  });

  it("keeps different signature classes as separate incidents", () => {
    const events = [
      ...repeat(5, () => event("injection_pattern", { metadata: { signature: "sqli.union" } })),
      ...repeat(5, () => event("injection_pattern", { metadata: { signature: "traversal.dotdot" } })),
    ];
    expect(detect(ctx(events)).filter((f) => f.type === "injection_pattern")).toHaveLength(2);
  });
});

describe("malware", () => {
  it("a single blocked file is an incident (catalog threshold: any)", () => {
    const [finding] = detect(ctx([event("virus_scan_blocked", { where: "/api/admin/upload" })]));
    expect(finding.type).toBe("malware_upload");
    expect(finding.runbook).toBe("docs/RUNBOOKS.md §I12");
    expect(finding.detectionReason).toContain("did not reach storage");
  });

  it("reports the scanner failing OPEN as its own problem", () => {
    const events = repeat(4, () => event("virus_scan_skipped", { where: "/api/admin/upload" }));
    const [finding] = detect(ctx(events));
    expect(finding.title).toBe("Malware scanning is not running");
    expect(finding.detectionReason).toContain("WITHOUT a completed malware check");
    expect(finding.detectionReason).toContain("FAIL_CLOSED_VIRUS_SCAN");
  });
});

describe("cron secret probing", () => {
  it("fires on any occurrence and names the remediation", () => {
    const [finding] = detect(ctx([event("cron_auth_failed", { where: "/api/cron/cleanup" })]));
    expect(finding.type).toBe("cron_auth_failed");
    expect(finding.severity).toBe(2);
    expect(finding.detectionReason).toContain("rotate CRON_SECRET");
  });
});

describe("rate limiter degradation", () => {
  it("needs the catalog's '2+ in 10 min', not a single blip", () => {
    expect(detect(ctx([event("rate_limiter_degraded")]))).toEqual([]);
    const two = [
      event("rate_limiter_degraded", { occurredAt: NOW - 60_000 }),
      event("rate_limiter_degraded", { occurredAt: NOW - 120_000 }),
    ];
    expect(detect(ctx(two))).toHaveLength(1);
  });

  it("names the likely cause rather than blaming the limiter", () => {
    const two = repeat(2, (i) => event("rate_limiter_degraded", { occurredAt: NOW - i * 60_000 }));
    expect(detect(ctx(two))[0].detectionReason).toContain("symptom of a database problem");
  });
});

describe("baselines", () => {
  const flood = repeat(200, () =>
    event("rate_limited", { where: "/api/search", service: "search", fingerprint: "rate_limited:/api/search" }),
  );

  it("quantifies the deviation when a usable baseline exists", () => {
    const baselines = new Map<string, Baseline>([
      ["rate_limited:/api/search", { signal: "rate_limited:/api/search", mean: 10, stddev: 3, sampleCount: 100 }],
    ]);
    const [finding] = detect(ctx(flood, baselines));
    expect(finding.detectionReason).toMatch(/× the 100-sample baseline/);
  });

  it("ignores a baseline with too little history rather than guessing", () => {
    const baselines = new Map<string, Baseline>([
      ["rate_limited:/api/search", { signal: "rate_limited:/api/search", mean: 1, stddev: 0, sampleCount: 3 }],
    ]);
    const [finding] = detect(ctx(flood, baselines));
    expect(finding.detectionReason).not.toContain("baseline");
  });

  it("says nothing about baselines when the deviation is small", () => {
    const baselines = new Map<string, Baseline>([
      ["rate_limited:/api/search", { signal: "rate_limited:/api/search", mean: 190, stddev: 20, sampleCount: 100 }],
    ]);
    const [finding] = detect(ctx(flood, baselines));
    expect(finding.detectionReason).not.toContain("baseline");
  });
});

describe("suppression (catalog hygiene rule 1)", () => {
  it("a live site-down incident suppresses its dependent children", () => {
    const live = new Set(["site_down:production"]);
    expect(suppressorFor("dependency_degraded:production", live)).toBe("site_down:production");
    expect(suppressorFor("rate_limit_storm:/api/search", live)).toBe("site_down:production");
  });

  it("never suppresses the parent itself", () => {
    expect(suppressorFor("site_down:production", new Set(["site_down:production"]))).toBeNull();
  });

  it("suppresses nothing when no parent is live", () => {
    expect(suppressorFor("dependency_degraded:production", new Set())).toBeNull();
  });

  it("an admin auth attack suppresses the public one, not the reverse", () => {
    expect(suppressorFor("auth_attack:public", new Set(["auth_attack:admin"]))).toBe("auth_attack:admin");
    expect(suppressorFor("auth_attack:admin", new Set(["auth_attack:public"]))).toBeNull();
  });
});

describe("correlation", () => {
  it("makes the most severe overlapping finding the parent of the rest", () => {
    const findings = detect(
      ctx([
        ...repeat(12, () => event("login_failed", { target: "u1", where: "/admin/login", occurredAt: NOW - 60_000 })),
        ...repeat(30, (i) => event("enumeration", { ipHash: "s", where: `/p${i}`, occurredAt: NOW - 60_000 })),
      ]),
    );
    const parents = correlate(findings);
    expect(parents.get("enumeration:/")).toBe("auth_attack:admin");
  });

  it("does not correlate a lone finding", () => {
    expect(correlate([]).size).toBe(0);
  });
});

describe("engine contract", () => {
  it("a broken detector does not stop the others", () => {
    const broken = {
      name: "broken",
      describes: "throws",
      run() {
        throw new Error("boom");
      },
    };
    DETECTORS.push(broken);
    try {
      const findings = detect(ctx([event("cron_auth_failed", { where: "/api/cron/x" })]));
      expect(findings).toHaveLength(1);
    } finally {
      DETECTORS.pop();
    }
  });

  it("orders findings most severe first", () => {
    const findings = detect(
      ctx([
        ...repeat(120, () => event("rate_limited", { where: "/api/search", service: "search", fingerprint: "rate_limited:/api/search" })),
        event("privilege_change", { result: "success", metadata: { from: "reader", to: "super_admin", targetUserId: "u" } }),
      ]),
    );
    expect(findings[0].severity).toBe(1);
    expect(findings.map((f) => f.severity)).toEqual([...findings.map((f) => f.severity)].sort((a, b) => a - b));
  });

  it("reports one finding per fingerprint, keeping the most severe", () => {
    // Brute force and credential stuffing overlap by construction.
    const events = repeat(40, (i) =>
      event("login_failed", { target: `u${i % 10}`, ipHash: "one-client", where: "/admin/login" }),
    );
    const findings = detect(ctx(events));
    expect(new Set(findings.map((f) => f.fingerprint)).size).toBe(findings.length);
  });

  it("every finding carries a runbook or is explicitly informational", () => {
    const findings = detect(
      ctx([
        ...repeat(12, () => event("login_failed", { target: "u", where: "/admin/login" })),
        event("virus_scan_blocked"),
        event("cron_auth_failed", { where: "/api/cron/x" }),
      ]),
    );
    for (const f of findings) {
      if (f.severity <= 2) expect(f.runbook, `${f.type} has no runbook`).toBeTruthy();
    }
  });

  it("every detector names itself in its findings", () => {
    const findings = detect(ctx(repeat(12, () => event("login_failed", { target: "u" }))));
    for (const f of findings) expect(f.detector).toBeTruthy();
  });

  it("never emits a detector for a type with no configured source (decision D3)", () => {
    const names = DETECTORS.map((d) => d.name);
    expect(names).not.toContain("waf_spike");
    expect(names).not.toContain("ddos_signal");
  });

  it("runbookFor covers every high-severity type the detectors can produce", () => {
    const produced: SecurityEventType[] = [
      "brute_force",
      "credential_stuffing",
      "mfa_failure_spike",
      "auth_anomaly",
      "admin_auth_anomaly",
      "privilege_escalation",
      "rate_limit_storm",
      "download_abuse",
      "captcha_storm",
      "enumeration",
      "injection_pattern",
      "upload_abuse",
      "malware_upload",
      "cron_auth_failed",
      "rate_limiter_degraded",
      "lockdown_blocked",
    ];
    for (const type of produced) expect(runbookFor(type), type).toBeTruthy();
  });

  it("handles a very large window without pathological behaviour", () => {
    const events = repeat(20_000, (i) =>
      event("rate_limited", { where: "/api/search", service: "search", fingerprint: "rate_limited:/api/search", occurredAt: NOW - i }),
    );
    const started = Date.now();
    const findings = detect(ctx(events));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(findings).toHaveLength(1);
    // Evidence ids are capped: an incident does not need 20,000 foreign keys.
    expect(findings[0].eventIds.length).toBeLessThanOrEqual(200);
    expect(findings[0].eventCount).toBe(20_000);
  });
});
