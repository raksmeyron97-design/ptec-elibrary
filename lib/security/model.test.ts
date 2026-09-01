import { describe, it, expect } from "vitest";
import {
  baseSeverity,
  classifySignatures,
  DERIVED_TYPES,
  escalate,
  fingerprint,
  hasConfiguredSource,
  isDerived,
  MAX_DETAIL_LENGTH,
  normalizeEvent,
  riskBand,
  routeScope,
  sanitizeMetadata,
  sanitizeText,
  scoreRisk,
  serviceFor,
  SOURCELESS_TYPES,
  type SecurityEventType,
} from "./model";
import {
  FAKE_GITHUB_TOKEN,
  FAKE_GOOGLE_KEY,
  FAKE_JWT,
  FAKE_SUPABASE_KEY,
  FAKE_TELEGRAM_TOKEN,
} from "./secret-fixtures";

describe("severity", () => {
  it("mirrors docs/ALERT-CATALOG.md for the alerts the catalog names", () => {
    // These are the catalog's Sev column, not opinions. If the catalog
    // changes, this test is the thing that notices.
    expect(baseSeverity("site_down")).toBe(1); // site-down → Sev 1
    expect(baseSeverity("secret_detected")).toBe(1); // secret-in-history → Sev 1
    expect(baseSeverity("privilege_escalation")).toBe(1); // privilege-change "1 if unexpected"
    expect(baseSeverity("admin_auth_anomaly")).toBe(2); // admin-auth-anomaly → Sev 2
    expect(baseSeverity("cron_auth_failed")).toBe(2); // cron-secret-guessing → Sev 2
    expect(baseSeverity("rate_limit_storm")).toBe(2); // rate-limit-storm → Sev 2
    expect(baseSeverity("security_spike")).toBe(2); // security-spike → Sev 2
    expect(baseSeverity("rate_limiter_degraded")).toBe(2); // rate-limiter-degraded → Sev 2
    expect(baseSeverity("virus_scan_blocked")).toBe(2); // malware-upload → Sev 2
    expect(baseSeverity("backup_failed")).toBe(2); // backup-failed → Sev 2
    expect(baseSeverity("captcha_storm")).toBe(3); // captcha-storm → Sev 3
    expect(baseSeverity("waf_spike")).toBe(3); // waf-spike → Sev 3
    expect(baseSeverity("privilege_change")).toBe(3); // privilege-change → Sev 3 info
    expect(baseSeverity("dependency_vulnerability")).toBe(3); // dependency-vuln → Sev 3
    expect(baseSeverity("csp_violation")).toBe(4); // csp-novel-violation → Sev 4
  });

  it("keeps every single low-signal event at Sev 4 (catalog hygiene rule 4)", () => {
    // "No per-user-error alerts: single 404s, individual failed logins, and
    // one-off captcha failures are dashboard data, not alerts."
    for (const t of ["login_failed", "captcha_failed", "rate_limited", "auth_forbidden", "enumeration"] as const) {
      expect(baseSeverity(t)).toBe(4);
    }
  });

  it("escalate never goes past Sev 1", () => {
    expect(escalate(3)).toBe(2);
    expect(escalate(2, 5)).toBe(1);
    expect(escalate(1)).toBe(1);
  });
});

describe("risk scoring", () => {
  it("bands follow the documented thresholds", () => {
    expect(riskBand(0)).toBe("LOW");
    expect(riskBand(29)).toBe("LOW");
    expect(riskBand(30)).toBe("MEDIUM");
    expect(riskBand(59)).toBe("MEDIUM");
    expect(riskBand(60)).toBe("HIGH");
    expect(riskBand(79)).toBe("HIGH");
    expect(riskBand(80)).toBe("CRITICAL");
    expect(riskBand(100)).toBe("CRITICAL");
  });

  it("a single failed login is LOW — one is never news", () => {
    const r = scoreRisk({ type: "login_failed", count: 1, where: "/auth/login" });
    expect(r.band).toBe("LOW");
  });

  it("repeated failed logins reach MEDIUM by volume alone", () => {
    const r = scoreRisk({ type: "login_failed", count: 60, where: "/auth/login" });
    expect(r.band).toBe("MEDIUM");
    expect(r.reason).toContain("60 occurrences");
  });

  it("an attack on the admin surface outranks the same attack in public", () => {
    const pub = scoreRisk({ type: "brute_force", count: 40, where: "/auth/login" });
    const adm = scoreRisk({ type: "brute_force", count: 40, where: "/admin/login" });
    expect(adm.score).toBeGreaterThan(pub.score);
  });

  it("an unexpected super_admin grant is CRITICAL", () => {
    const r = scoreRisk({
      type: "privilege_escalation",
      count: 1,
      where: "setUserRole",
      target: "super_admin",
      result: "success",
    });
    expect(r.band).toBe("CRITICAL");
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it("a committed secret is CRITICAL", () => {
    expect(scoreRisk({ type: "secret_detected" }).band).toBe("CRITICAL");
  });

  it("blocked traffic scores below traffic that got through", () => {
    const blocked = scoreRisk({ type: "injection_pattern", count: 5, result: "blocked" });
    const through = scoreRisk({ type: "injection_pattern", count: 5, result: "success" });
    expect(through.score).toBeGreaterThan(blocked.score);
  });

  it("volume is log-scaled — 1000 events is not 100x the risk of 10", () => {
    const ten = scoreRisk({ type: "rate_limited", count: 10 }).score;
    const thousand = scoreRisk({ type: "rate_limited", count: 1000 }).score;
    expect(thousand).toBeGreaterThan(ten);
    expect(thousand).toBeLessThan(ten * 4);
  });

  it("always clamps to 0..100 and always explains itself", () => {
    for (const count of [1, 10, 100, 10_000, 1_000_000]) {
      const r = scoreRisk({
        type: "privilege_escalation",
        count,
        where: "/admin/super_admin",
        result: "success",
        actorType: "admin",
      });
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it("is total — an unknown type scores rather than throwing", () => {
    expect(() =>
      scoreRisk({ type: "not_a_real_type" as SecurityEventType }),
    ).not.toThrow();
  });
});

describe("fingerprints", () => {
  it("collapses one attack onto one key regardless of which account was hit", () => {
    const a = fingerprint({ type: "login_failed", where: "/admin/login", target: "alice" });
    const b = fingerprint({ type: "login_failed", where: "/admin/login", target: "bob" });
    expect(a).toBe(b);
    expect(a).toBe("auth_attack:admin");
  });

  it("separates the admin login from the public login", () => {
    expect(fingerprint({ type: "login_failed", where: "/admin/login" })).not.toBe(
      fingerprint({ type: "login_failed", where: "/auth/login" }),
    );
  });

  it("scopes privilege incidents to the principal that changed", () => {
    const fp = fingerprint({ type: "privilege_escalation", target: "user-123" });
    expect(fp).toBe("privilege:user-123");
  });

  it("normalizes dynamic route segments so one route is one incident", () => {
    const a = fingerprint({ type: "rate_limited", where: "/api/books/9f1c2b7e-1111-4222-8333-abcdefabcdef/file" });
    const b = fingerprint({ type: "rate_limited", where: "/api/books/1a2b3c4d-5555-4666-8777-fedcbafedcba/file" });
    expect(a).toBe(b);
  });

  it("never includes an IP — a rotating attacker must not multiply incidents", () => {
    const fp = fingerprint({ type: "rate_limited", where: "/api/search" });
    expect(fp).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it("groups malware by service, not by file", () => {
    expect(fingerprint({ type: "virus_scan_blocked", service: "uploads" })).toBe("malware:uploads");
  });
});

describe("routeScope", () => {
  it("strips query strings, ids, numbers and long slugs", () => {
    expect(routeScope("/api/books/abc?x=1")).toBe("/api/books/abc");
    expect(routeScope("/api/theses/12345/file")).toBe("/api/theses/:n/file");
    expect(routeScope("/books/[slug]/download")).toBe("/books/:id/download");
    expect(routeScope("")).toBe("unknown");
  });
});

describe("sanitizeText", () => {
  // Fixtures are assembled at runtime by `./secret-fixtures` — see that file
  // for why a credential-shaped literal must not be committed here.
  it("redacts JWTs", () => {
    const out = sanitizeText(`failed with ${FAKE_JWT}`);
    expect(out).toContain("[jwt]");
    expect(out).not.toContain(FAKE_JWT.slice(0, 20));
  });

  it("redacts Supabase, Google, GitHub and Telegram credentials", () => {
    expect(sanitizeText(`key=${FAKE_SUPABASE_KEY}`)).not.toContain(FAKE_SUPABASE_KEY.slice(-20));
    expect(sanitizeText(FAKE_GOOGLE_KEY)).toContain("[google-key]");
    expect(sanitizeText(FAKE_GITHUB_TOKEN)).toContain("[github-token]");
    expect(sanitizeText(FAKE_TELEGRAM_TOKEN)).toContain("[telegram-token]");
  });

  it("redacts email addresses", () => {
    expect(sanitizeText("login failed for someone@example.com")).toBe("login failed for [email]");
  });

  it("redacts any labelled secret whatever its shape", () => {
    expect(sanitizeText("password: hunter2")).toBe("[redacted]");
    expect(sanitizeText("Authorization: Bearer zzz")).toContain("[redacted]");
  });

  it("truncates to the documented maximum", () => {
    const out = sanitizeText("x".repeat(5000));
    expect(out!.length).toBeLessThanOrEqual(MAX_DETAIL_LENGTH);
  });

  it("returns undefined for empty input rather than an empty string", () => {
    expect(sanitizeText(undefined)).toBeUndefined();
    expect(sanitizeText("   ")).toBeUndefined();
  });
});

describe("sanitizeMetadata", () => {
  it("drops forbidden keys outright rather than redacting them", () => {
    const out = sanitizeMetadata({ password: "x", token: "y", cookie: "z", route: "/api/x" });
    expect(out).toEqual({ route: "/api/x" });
    expect("password" in out).toBe(false);
  });

  it("drops user content keys — the log contract forbids message bodies", () => {
    const out = sanitizeMetadata({ body: "hello", message: "hi", query: "cats", count: 3 });
    expect(out).toEqual({ count: 3 });
  });

  it("summarizes nested structures instead of recursing into payloads", () => {
    const out = sanitizeMetadata({ nested: { a: 1, b: 2 }, list: [1, 2, 3] });
    expect(out.nested).toBe("{2 keys}");
    expect(out.list).toBe("[3 items]");
  });

  it("scrubs string values it does keep", () => {
    const out = sanitizeMetadata({ reason: "contact bob@example.com" });
    expect(out.reason).toBe("contact [email]");
  });

  it("drops `note` — this app stores user-written book notes under that name", () => {
    expect(sanitizeMetadata({ note: "anything" })).toEqual({});
  });

  it("bounds the number of keys", () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) big[`k${i}`] = i;
    expect(Object.keys(sanitizeMetadata(big)).length).toBeLessThanOrEqual(20);
  });

  it("handles undefined and non-objects", () => {
    expect(sanitizeMetadata(undefined)).toEqual({});
  });
});

describe("classifySignatures", () => {
  it("classifies the families it claims to", () => {
    expect(classifySignatures("/search?q=1' UNION SELECT password FROM users--")).toContain("sqli.union");
    expect(classifySignatures("?id=1 OR 1=1")).toContain("sqli.boolean");
    expect(classifySignatures("<script>alert(1)</script>")).toContain("xss.script");
    expect(classifySignatures("?next=javascript:alert(1)")).toContain("xss.javascript_uri");
    expect(classifySignatures("/files/../../etc/passwd")).toContain("traversal.dotdot");
    expect(classifySignatures("/files/%2e%2e/etc")).toContain("traversal.encoded");
    expect(classifySignatures("/x?c=;cat /etc/passwd")).toContain("cmdi.shell");
    expect(classifySignatures("/proxy?url=http://169.254.169.254/")).toContain("ssrf.internal_host");
    expect(classifySignatures("/wp-admin/setup-config.php")).toContain("scanner.wellknown_probe");
  });

  it("sees through one layer of percent-encoding", () => {
    expect(classifySignatures("/x?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")).toContain("xss.script");
  });

  it("returns classes only — never the matched payload", () => {
    const classes = classifySignatures("<script>steal()</script>");
    expect(JSON.stringify(classes)).not.toContain("steal");
  });

  it("does not match ordinary library traffic", () => {
    expect(classifySignatures("/books?subject=Mathematics&lang=km")).toEqual([]);
    expect(classifySignatures("/search?q=ការអប់រំ")).toEqual([]);
    expect(classifySignatures("/theses/teacher-training-2024")).toEqual([]);
  });

  it("is total on malformed encoding and empty input", () => {
    expect(() => classifySignatures("%zz%")).not.toThrow();
    expect(classifySignatures(null)).toEqual([]);
    expect(classifySignatures("")).toEqual([]);
  });
});

describe("serviceFor", () => {
  it("groups routes into the services the dashboard shows", () => {
    expect(serviceFor("/admin/users")).toBe("admin");
    expect(serviceFor("/auth/login")).toBe("auth");
    expect(serviceFor("/api/cron/cleanup")).toBe("cron");
    expect(serviceFor("/api/admin/upload")).toBe("admin");
    expect(serviceFor("/api/books/[slug]/download")).toBe("delivery");
    expect(serviceFor("/api/search/native")).toBe("search");
    expect(serviceFor("/api/oai")).toBe("api");
  });
});

describe("sourceless types", () => {
  it("marks Cloudflare-derived types as having no configured source (decision D3)", () => {
    expect(SOURCELESS_TYPES).toContain("waf_spike");
    expect(SOURCELESS_TYPES).toContain("ddos_signal");
    expect(hasConfiguredSource("waf_spike")).toBe(false);
    expect(hasConfiguredSource("brute_force")).toBe(true);
  });

  it("identifies derived types so detectors do not re-derive from themselves", () => {
    expect(isDerived("brute_force")).toBe(true);
    expect(isDerived("login_failed")).toBe(false);
    for (const t of DERIVED_TYPES) expect(isDerived(t)).toBe(true);
  });
});

describe("normalizeEvent", () => {
  const AT = Date.parse("2026-08-31T14:00:00.000Z");

  it("fills in everything a call site does not pass", () => {
    const e = normalizeEvent({ type: "rate_limited", where: "/api/search", at: AT });
    expect(e.severity).toBe(4);
    expect(e.actorType).toBe("anonymous");
    expect(e.result).toBe("blocked");
    expect(e.service).toBe("search");
    expect(e.count).toBe(1);
    expect(e.fingerprint).toBe("rate_limited:/api/search");
    expect(e.timestamp).toBe("2026-08-31T14:00:00.000Z");
    expect(e.riskReason).toContain("rate_limited base");
  });

  it("infers a user actor from userId", () => {
    const e = normalizeEvent({ type: "auth_forbidden", where: "requireAdmin", userId: "u1" });
    expect(e.actorType).toBe("user");
    expect(e.actorId).toBe("u1");
  });

  it("treats derived events as system-generated", () => {
    expect(normalizeEvent({ type: "brute_force", where: "detector" }).actorType).toBe("system");
  });

  it("keeps a raw privilege_change informational — the DERIVED event is what pages", () => {
    // This is the event/alert/incident split (brief §7) made concrete. Every
    // role change is recorded; a routine one is Sev 3 dashboard data. A grant
    // of super_admin scores HIGH so it is impossible to miss on the dashboard,
    // but it still does not page — the detector decides whether the grant was
    // expected and emits `privilege_escalation` (Sev 1) when it was not.
    const routine = normalizeEvent({ type: "privilege_change", where: "setUserRole", target: "reader" });
    expect(routine.severity).toBe(3);
    expect(routine.riskScore).toBeLessThan(60);

    const superGrant = normalizeEvent({
      type: "privilege_change",
      where: "setUserRole",
      target: "super_admin",
      result: "success",
      actorType: "admin",
    });
    expect(superGrant.riskScore).toBeGreaterThanOrEqual(60);
    expect(superGrant.severity).toBe(3);

    const escalation = normalizeEvent({
      type: "privilege_escalation",
      where: "setUserRole",
      target: "super_admin",
      result: "success",
    });
    expect(escalation.severity).toBe(1);
    expect(escalation.riskScore).toBeGreaterThanOrEqual(80);
  });

  it("escalates severity when volume + surface push a Sev 2 event into CRITICAL", () => {
    const one = normalizeEvent({ type: "virus_scan_blocked", where: "/api/admin/upload" });
    expect(one.severity).toBe(2);

    const many = normalizeEvent({ type: "virus_scan_blocked", where: "/api/admin/upload", count: 20 });
    expect(many.riskScore).toBeGreaterThanOrEqual(80);
    expect(many.severity).toBe(1);
  });

  it("scrubs detail and metadata on the way through", () => {
    const e = normalizeEvent({
      type: "suspicious_input",
      where: "/api/contact",
      detail: "rejected for bob@example.com",
      metadata: { password: "x", route: "/api/contact" },
    });
    expect(e.detail).toBe("rejected for [email]");
    expect(e.metadata).toEqual({ route: "/api/contact" });
  });

  it("never throws on hostile input", () => {
    expect(() =>
      normalizeEvent({
        type: "rate_limited",
        where: " ".repeat(10_000),
        detail: "x".repeat(100_000),
        metadata: { a: { b: { c: 1 } } },
        count: -5,
      }),
    ).not.toThrow();
  });

  it("floors count at 1 so a bad caller cannot produce a zero-weight event", () => {
    expect(normalizeEvent({ type: "rate_limited", where: "/x", count: -3 }).count).toBe(1);
  });
});
