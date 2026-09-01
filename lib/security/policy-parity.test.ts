import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { securityConfigSnapshot } from "./config";
import { DETECTORS, runbookFor } from "./detect";
import { SOURCELESS_TYPES } from "./model";

/**
 * Invariant tests: these read SOURCE and DOCS, not just functions.
 *
 * The security monitoring system has one property that no unit test of a pure
 * function can protect: the policy lives in `docs/ALERT-CATALOG.md`, the
 * thresholds live in `lib/security/config.ts`, the operator-facing explanation
 * lives in `docs/SECURITY-MONITORING.md`, and an operator must be able to set
 * any of them from `.env.example`. Four places, one truth. This file fails
 * when they drift.
 *
 * When one of these fails, the fix is almost always in the file it scanned —
 * not in the test. (Same contract as `lib/settings-consistency.test.ts` and
 * the other invariant suites listed in CLAUDE.md.)
 */

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const CONFIG_SRC = read("lib/security/config.ts");
const ENV_EXAMPLE = read(".env.example");
const MONITORING_DOC = read("docs/SECURITY-MONITORING.md");
const ALERT_CATALOG = read("docs/ALERT-CATALOG.md");
const RUNBOOKS = read("docs/RUNBOOKS.md");

/** Every `process.env.X` name config.ts reads. */
function configEnvVars(): string[] {
  const names = new Set<string>();
  for (const match of CONFIG_SRC.matchAll(/env(?:Int|Num|Bool)\("([A-Z0-9_]+)"/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

describe("configuration is documented where operators will look", () => {
  const vars = configEnvVars();

  it("finds a non-trivial set of variables to check", () => {
    expect(vars.length).toBeGreaterThan(20);
  });

  it.each(configEnvVars())("%s appears in .env.example", (name) => {
    expect(
      ENV_EXAMPLE.includes(name),
      `${name} is read by lib/security/config.ts but is not in .env.example. An operator retuning a threshold during an incident will not find it.`,
    ).toBe(true);
  });

  it("every value in the snapshot is a plain number or boolean", () => {
    // The snapshot is rendered on the admin console and could otherwise leak
    // an object with something sensitive inside it.
    for (const [key, value] of Object.entries(securityConfigSnapshot())) {
      expect(["number", "boolean"], `${key} is not a scalar`).toContain(typeof value);
    }
  });

  it("the documented defaults match the code", () => {
    // Only the ones the doc states explicitly — a table that quietly goes
    // stale is worse than no table.
    const snapshot = securityConfigSnapshot();
    const documented: [string, number | boolean][] = [
      ["SECURITY_ALERT_MIN_SEVERITY", snapshot.telegramMinSeverity],
      ["ALERT_COOLDOWN_SECONDS", snapshot.alertCooldownSeconds],
      ["INCIDENT_RECOVERY_QUIET_SECONDS", snapshot.incidentRecoveryQuietSeconds],
      ["AUTH_ATTACK_THRESHOLD", snapshot.authAttackThreshold],
      ["CREDENTIAL_STUFFING_ACCOUNTS", snapshot.credentialStuffingAccounts],
      ["RATE_LIMIT_ALERT_THRESHOLD", snapshot.rateLimitAlertThreshold],
      ["CAPTCHA_STORM_THRESHOLD", snapshot.captchaStormThreshold],
      ["INJECTION_THRESHOLD", snapshot.injectionThreshold],
      ["SECURITY_EVENT_RETENTION_DAYS", snapshot.securityEventRetentionDays],
    ];
    for (const [name, value] of documented) {
      const row = MONITORING_DOC.split("\n").find(
        (line) => line.includes(`\`${name}\``) && line.trim().startsWith("|"),
      );
      expect(row, `${name} has no row in the SECURITY-MONITORING.md config table`).toBeTruthy();
      expect(
        row!.includes(`\`${String(value)}\``),
        `SECURITY-MONITORING.md documents a different default for ${name} than the code produces (${value}).`,
      ).toBe(true);
    }
  });
});

describe("the catalog and the code agree", () => {
  it("the catalog's Security section no longer claims an unbuilt mechanism", () => {
    // It used to describe thresholds against log lines nobody collected.
    expect(ALERT_CATALOG).toContain("These are now executable");
    expect(ALERT_CATALOG).toContain("security_events");
  });

  it("the catalog names Cloudflare WAF as having no source", () => {
    // The honesty requirement: a zero must never read as an all-clear.
    const wafRow = ALERT_CATALOG.split("\n").find((l) => l.startsWith("| waf-spike"));
    expect(wafRow).toBeTruthy();
    expect(wafRow!.toLowerCase()).toContain("no source");
    expect(SOURCELESS_TYPES).toContain("waf_spike");
  });

  it("MONITORING.md no longer tells the reader to wire an aggregator that never existed", () => {
    const doc = read("docs/MONITORING.md");
    expect(doc).toContain("no longer depend on an aggregator");
    expect(doc).toContain("SECURITY-MONITORING.md");
  });
});

describe("detectors are honest about coverage", () => {
  it("every detector describes itself in a sentence", () => {
    for (const d of DETECTORS) {
      expect(d.describes.length, `${d.name} has no description`).toBeGreaterThan(15);
    }
  });

  it("no detector exists for a type with no configured source", () => {
    const names = new Set(DETECTORS.map((d) => d.name));
    for (const type of SOURCELESS_TYPES) {
      expect(
        names.has(type),
        `${type} has no source in this deployment but a detector exists for it — it would report zero forever, which reads as "no attacks".`,
      ).toBe(false);
    }
  });

  it("every runbook a detector points at actually exists", () => {
    const files = new Map<string, string>();
    for (const d of DETECTORS) {
      const runbook = runbookFor(d.name as Parameters<typeof runbookFor>[0]);
      if (!runbook) continue;
      const [file, section] = runbook.split(" §");
      if (!files.has(file)) {
        expect(
          fs.existsSync(path.join(ROOT, file)),
          `${d.name} points at ${file}, which does not exist`,
        ).toBe(true);
        files.set(file, read(file));
      }
      if (section) {
        expect(
          files.get(file)!.includes(section),
          `${d.name} points at ${runbook}, but "${section}" is not a heading in ${file}`,
        ).toBe(true);
      }
    }
  });

  it("the runbook sections the catalog's new security rows cite exist", () => {
    for (const section of ["I8", "I9", "I10", "I12", "I13", "I16"]) {
      expect(RUNBOOKS.includes(`### ${section} `), `RUNBOOKS.md has no ${section} section`).toBe(true);
    }
  });
});

describe("the server-only sink stays inverted", () => {
  // lib/security-log.ts must remain importable from anywhere — the pure tests,
  // the emitters, and any layer that is not the Node server. That only holds
  // while `instrumentation.ts` is the one file that imports the sink.
  it("only instrumentation.ts imports lib/security/sink", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (["node_modules", ".next", ".git", "test-results"].includes(entry.name)) continue;
          walk(rel);
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
          const src = read(rel);
          if (/from ["']@\/lib\/security\/sink["']|from ["']\.\/sink["']/.test(src)) {
            offenders.push(rel);
          }
        }
      }
    };
    for (const dir of ["app", "lib", "components"]) walk(dir);

    // incidents.ts is the one legitimate other importer: the detection pass
    // must flush the buffer before it reads, and it is already server-only.
    expect(offenders.sort()).toEqual([path.join("lib", "security", "incidents.ts")]);
  });

  it("lib/security-log.ts does not import server-only", () => {
    expect(read("lib/security-log.ts")).not.toContain('import "server-only"');
  });

  it("the pure modules stay pure", () => {
    for (const file of [
      "lib/security/model.ts",
      "lib/security/detect.ts",
      "lib/security/incident-policy.ts",
      "lib/security/config.ts",
      "lib/security/notify/format.ts",
    ]) {
      // Match IMPORT STATEMENTS, not prose — these files document their own
      // purity rules in their headers, and a substring search would flag the
      // comment that explains the rule.
      const imports = [...read(file).matchAll(/^\s*import\s[^;]*?["']([^"']+)["']/gm)].map(
        (m) => m[1],
      );
      for (const forbidden of ["server-only", "next/headers", "@supabase/supabase-js", "next/cache"]) {
        expect(imports, `${file} must not import ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
