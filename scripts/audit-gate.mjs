#!/usr/bin/env node
/**
 * Production-dependency audit gate for CI.
 *
 * Replaces a bare `npm audit --audit-level=high`, which fails the build on any
 * high-severity advisory — including ones with no available fix. When such an
 * advisory lands in a transitive dependency of the framework (2026-07-22:
 * `sharp`'s inherited libvips CVEs, reachable only through `next`, where npm's
 * only proposed "fix" was downgrading Next 16 → 9.3.3), that behaviour blocks
 * every pull request in the repository without making anything safer.
 *
 * This gate keeps the pressure where action is possible:
 *
 *   FAIL  high/critical advisories with an actionable fix — i.e. `npm audit
 *         fix` can resolve them without a semver-major dependency change.
 *   WARN  high/critical advisories whose only remedy is a semver-major bump or
 *         that have no published fix. Reported loudly, with advisory URLs, so
 *         they stay visible and reviewable, but they do not block the build.
 *
 * The moment upstream publishes a real fix, `fixAvailable` becomes actionable
 * and the advisory starts failing CI again — no allowlist to prune, nothing to
 * remember to revert.
 *
 * Moderate and low advisories are tracked manually (docs/SECURITY-OPS.md §6).
 * Dev-only dependencies are excluded: they never reach production.
 */

import { execFileSync } from "node:child_process";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

function runAudit() {
  try {
    // `npm audit` exits non-zero when it finds anything, so the output is read
    // from the error path as well as the success path.
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.trim().startsWith("{")) {
      return error.stdout;
    }
    throw error;
  }
}

/**
 * `fixAvailable` is `true` (a plain `npm audit fix` resolves it), `false` (no
 * published fix), or an object describing the upgrade — which we only consider
 * actionable when it is not a semver-major change.
 */
function isActionable(fixAvailable) {
  if (fixAvailable === true) return true;
  if (!fixAvailable || typeof fixAvailable !== "object") return false;
  return fixAvailable.isSemVerMajor !== true;
}

function describeFix(fixAvailable) {
  if (fixAvailable === true) return "run `npm audit fix`";
  if (!fixAvailable || typeof fixAvailable !== "object") return "no fix published";
  const { name, version, isSemVerMajor } = fixAvailable;
  return `${name}@${version}${isSemVerMajor ? " (semver-major)" : ""}`;
}

const report = JSON.parse(runAudit());
const vulnerabilities = Object.values(report.vulnerabilities ?? {});

const blocking = [];
const advisory = [];

for (const vuln of vulnerabilities) {
  if (!BLOCKING_SEVERITIES.has(vuln.severity)) continue;
  (isActionable(vuln.fixAvailable) ? blocking : advisory).push(vuln);
}

const line = (vuln) => {
  const urls = (vuln.via ?? [])
    .filter((via) => typeof via === "object" && via.url)
    .map((via) => via.url);
  const detail = urls.length > 0 ? `\n      ${[...new Set(urls)].join("\n      ")}` : "";
  return `  ${vuln.severity.toUpperCase().padEnd(8)} ${vuln.name}  →  ${describeFix(vuln.fixAvailable)}${detail}`;
};

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `Production dependency audit: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
    `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low.`,
);

if (advisory.length > 0) {
  console.log(
    `\n⚠  ${advisory.length} high/critical advisory(ies) with no actionable fix — not blocking, ` +
      `but review before the next dependency bump:`,
  );
  for (const vuln of advisory) console.log(line(vuln));
}

if (blocking.length > 0) {
  console.error(`\n✖  ${blocking.length} high/critical advisory(ies) are fixable and must be resolved:`);
  for (const vuln of blocking) console.error(line(vuln));
  console.error("\nResolve them (usually `npm audit fix`), commit the lockfile, and push again.");
  process.exit(1);
}

console.log("\n✔  No fixable high or critical advisories in production dependencies.");
