// scripts/check-subject-graduation.ts
//
//   npx tsx scripts/check-subject-graduation.ts --current reports/subjects.json
//   npx tsx scripts/check-subject-graduation.ts --current c.json --previous prev/baseline.json
//   npx tsx scripts/check-subject-graduation.ts --current c.json --baseline-out baseline.json
//
// Compares the set of INDEXABLE subject hubs against the previous complete
// check and says whether a human should be told. Reads two JSON files and
// writes one; it never touches the network, because
// scripts/verify-subject-indexability.ts has already done that and its output
// is the input here.
//
// ── Why this is a script and not six lines of YAML ───────────────────────────
//
// The decision has four outcomes and three of them are "say nothing", each for
// a different reason (nothing changed / no baseline / the run was partial).
// Expressed in shell that is a chain of `if [ -z ... ]` that nobody can test;
// expressed here it is lib/verify/subject-graduation.ts, which is pure and has
// a test for every degenerate case. The workflow only forwards the result.
//
// ── It never fails ───────────────────────────────────────────────────────────
//
// Exit 0 in every case, including a change. A hub graduating is a librarian
// doing their job, and a job that goes red for that is a job people stop
// reading — the same reasoning that keeps a transport failure out of `fail` in
// lib/verify/http.ts. The signal is a notification; the run stays green.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  compareIndexableSets,
  graduationMessage,
  shouldAlert,
  shouldRecordBaseline,
  type GraduationOutcome,
} from "../lib/verify/subject-graduation";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const CURRENT = flag("current");
const PREVIOUS = flag("previous");
const BASELINE_OUT = flag("baseline-out");
/** GitHub Actions output file, so the workflow can branch on the result. */
const GH_OUTPUT = process.env.GITHUB_OUTPUT;

type Baseline = { generatedAt: string; indexableSlugs: string[] };

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    // A corrupt baseline is NOT an empty one. Treating it as [] would report
    // every hub as freshly graduated, so it is reported as absent instead,
    // which bootstraps quietly.
    console.warn(`  baseline at ${path} could not be parsed (${(err as Error).message}) — treating as absent`);
    return null;
  }
}

function slugsOf(doc: unknown): string[] | null {
  if (!doc || typeof doc !== "object") return null;
  const v = (doc as Record<string, unknown>).indexableSlugs;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
}

function ghOutput(key: string, value: string): void {
  if (!GH_OUTPUT) return;
  // Multi-line safe, per the Actions docs.
  const delim = `ghadelim_${Math.random().toString(36).slice(2)}`;
  writeFileSync(GH_OUTPUT, `${key}<<${delim}\n${value}\n${delim}\n`, { flag: "a" });
}

function main(): void {
  if (!CURRENT) {
    console.error("--current <path to verify-subject-indexability --json output> is required");
    process.exit(1);
  }

  const currentDoc = readJson(CURRENT);
  const current = slugsOf(currentDoc);
  if (current === null) {
    // No set to compare: the verifier did not run, or ran an older build. Say
    // so and stay quiet rather than inventing a comparison.
    console.error(`  ${CURRENT} carries no indexableSlugs — nothing to compare`);
    ghOutput("alert", "false");
    process.exit(0);
  }

  const incomplete = Boolean((currentDoc as Record<string, unknown>)?.incomplete);
  const previous = PREVIOUS ? slugsOf(readJson(PREVIOUS)) : null;

  const outcome: GraduationOutcome = compareIndexableSets({ current, previous, incomplete });

  console.log(`\nIndexable subject hubs — ${outcome.kind}`);
  console.log(`  this run : ${outcome.current.length} hub(s)`);
  console.log(`  previous : ${previous === null ? "none on record" : `${previous.length} hub(s)`}`);
  if (outcome.kind === "bootstrap" || outcome.kind === "incomplete") console.log(`  ${outcome.reason}`);
  if (outcome.kind === "changed") {
    for (const s of outcome.graduated) console.log(`  GRADUATED  ${s}`);
    for (const s of outcome.demoted) console.log(`  demoted    ${s}`);
  }

  if (BASELINE_OUT && shouldRecordBaseline(outcome)) {
    mkdirSync(dirname(BASELINE_OUT), { recursive: true });
    const baseline: Baseline = {
      generatedAt: new Date().toISOString(),
      indexableSlugs: outcome.current,
    };
    writeFileSync(BASELINE_OUT, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`  baseline written to ${BASELINE_OUT}`);
  } else if (BASELINE_OUT) {
    console.log("  baseline NOT written — an incomplete run must not shrink it");
  }

  const alert = shouldAlert(outcome);
  ghOutput("alert", alert ? "true" : "false");
  if (alert && outcome.kind === "changed") {
    ghOutput("message", graduationMessage(outcome));
    ghOutput(
      "title",
      outcome.graduated.length > 0 && outcome.demoted.length === 0
        ? "Subject hub graduated to indexable"
        : outcome.demoted.length > 0 && outcome.graduated.length === 0
          ? "Subject hub fell below the depth gate"
          : "Indexable subject hubs changed",
    );
    console.log(`\n  → will notify: ${graduationMessage(outcome)}`);
  } else {
    console.log("\n  → no notification");
  }
  console.log();

  // Always 0: a graduation is not a failure.
  process.exit(0);
}

main();

export {};
