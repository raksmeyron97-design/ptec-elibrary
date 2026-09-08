/**
 * npm run reader:benchmark — the reader's measured performance, summarised.
 *
 * This is a REPORTER, not a second measurement harness. Everything it prints
 * is produced by `e2e/reader-performance.spec.ts`, which drives real pdf.js
 * against a real range-serving HTTP server (`e2e/utils/pdf-server.ts`) over
 * real multi-megabyte documents. That spec is the authority CLAUDE.md names —
 * "never claim a reader byte/memory change without it" — and duplicating its
 * instrumentation here would produce a second set of numbers that could
 * disagree with the ones the project actually gates on.
 *
 * What this adds is the part the spec deliberately does not do: it asserts
 * bounds, but writes its measurements to JSON without ranking or comparing
 * them. So a reader change could pass every assertion while quietly doubling
 * first-paint. This reads those reports, lays the four §46 metrics out in one
 * table, and diffs each against the baseline committed under
 * docs/reader-performance/ — which is what makes "faster" or "slower" a claim
 * with a number behind it rather than an impression.
 *
 *   npm run reader:benchmark            run the suite, then report
 *   npm run reader:benchmark -- --report-only   report the last run
 *   npm run reader:benchmark -- --save <name>   commit this run as a baseline
 *
 * EXIT CODE is 1 only on a REGRESSION beyond the noise band, never on a
 * missing report: a machine without the fixtures should say so and stop, not
 * fail a build with a number it does not have.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(ROOT, "reports/reader-performance");
const BASELINE_DIR = path.join(ROOT, "docs/reader-performance");

/** Below this, a difference is machine noise rather than a change. Reader
    timings on a laptop move by more than a build does. */
const NOISE_PCT = 15;
/** Bytes and memory are far steadier than wall-clock, so they get a tighter
    band — a 10% jump in what the reader downloads is a real change. */
const NOISE_PCT_BYTES = 10;

type Snapshot = Record<string, number | string | undefined> & { label?: string; ms?: number };
type Report = {
  file?: { pages: number; bytes: number };
  firstPaintMs?: number;
  atOpen?: Snapshot;
  idle?: Snapshot;
  snapshots?: Snapshot[];
  ms?: number;
};

type Metric = {
  group: string;
  name: string;
  value: number;
  unit: "ms" | "MB" | "n";
  /** Lower is better for everything here; kept explicit so it is not assumed. */
  lowerIsBetter: true;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function read(dir: string, name: string): Report | null {
  const file = path.join(dir, name);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Report;
  } catch {
    return null;
  }
}

/** Median, because one slow page turn in a session of ten is the machine, not
    the reader. p95 is reported separately where the tail is the point. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
}

/** Pull the §46 metrics out of one project's set of reports. */
function metricsFor(dir: string, project: string): Metric[] {
  const out: Metric[] = [];
  const push = (group: string, name: string, value: number | null, unit: Metric["unit"]) => {
    if (value !== null) out.push({ group, name, value, unit, lowerIsBetter: true });
  };

  // ── First page: the number a reader actually waits on ─────────────────────
  for (const mb of [10, 25, 50, 75, 100]) {
    const r = read(dir, `size-${mb}mb-${project}.json`);
    if (!r) continue;
    push("first page", `${mb} MB`, num(r.firstPaintMs), "ms");
    push("bytes to page 1", `${mb} MB`, num(r.atOpen?.serverMB), "MB");
    push("canvas at open", `${mb} MB`, num(r.atOpen?.canvasMB), "MB");
  }

  const long = read(dir, `long-session-${project}.json`);
  if (long?.snapshots?.length) {
    const snaps = long.snapshots;
    const open = snaps.find((s) => s.label === "open");
    push("first page", "500 pp (long session)", num(open?.ms), "ms");

    // ── Page switch: every labelled jump in the long session ────────────────
    const turns = snaps
      .filter((s) => typeof s.label === "string" && /^(page \d+|back to \d+)$/.test(s.label))
      .map((s) => num(s.ms))
      .filter((n): n is number => n !== null);
    push("page switch", "median", median(turns), "ms");
    push("page switch", "p95", p95(turns), "ms");

    // ── Search within book ─────────────────────────────────────────────────
    push("search in book", "500 pp", num(snaps.find((s) => s.label === "search")?.ms), "ms");

    // ── Memory across a long session: the ceiling, not the average ──────────
    const canvas = snaps.map((s) => num(s.canvasMB)).filter((n): n is number => n !== null);
    const heap = snaps.map((s) => num(s.heapMB)).filter((n): n is number => n !== null);
    if (canvas.length) push("memory ceiling", "canvas", Math.max(...canvas), "MB");
    if (heap.length) push("memory ceiling", "heap", Math.max(...heap), "MB");

    // The whole point of the bounded reader: bytes must not scale with pages.
    const last = snaps[snaps.length - 1];
    push("bytes, whole session", "500 pp", num(last?.serverMB), "MB");
    push("pages mounted, peak", "500 pp",
      Math.max(...snaps.map((s) => num(s.mounted) ?? 0)), "n");
  }

  const search = read(dir, `search-${project}.json`);
  if (search) push("search in book", "dedicated spec", num(search.ms), "ms");

  return out;
}

function projectsIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found = new Set<string>();
  for (const f of readdirSync(dir)) {
    const m = /^long-session-(.+)\.json$/.exec(f);
    if (m) found.add(m[1]);
  }
  return [...found].sort();
}

const fmt = (m: Metric) =>
  m.unit === "ms"
    ? `${Math.round(m.value)} ms`
    : m.unit === "MB"
      ? `${m.value.toFixed(1)} MB`
      : String(m.value);

function report(project: string): number {
  const current = metricsFor(REPORT_DIR, project);
  const baseline = metricsFor(BASELINE_DIR, project);
  const baseByKey = new Map(baseline.map((m) => [`${m.group}/${m.name}`, m]));

  if (current.length === 0) {
    console.log(`\n  ${project}: no measurements found in reports/reader-performance/.`);
    return 0;
  }

  console.log(`\n  ${project}`);
  console.log("  " + "─".repeat(74));
  console.log(
    `  ${"metric".padEnd(26)}${"now".padStart(11)}${"baseline".padStart(12)}${"change".padStart(12)}`,
  );

  // Metrics are produced per document size, so they arrive interleaved by
  // group. Re-order by group (keeping each group's first-seen position) so a
  // heading is printed once and its rows read as one comparison.
  const order: string[] = [];
  for (const m of current) if (!order.includes(m.group)) order.push(m.group);
  const grouped = order.flatMap((g) => current.filter((m) => m.group === g));

  let regressions = 0;
  let group = "";
  for (const m of grouped) {
    if (m.group !== group) {
      group = m.group;
      console.log(`  ${group}`);
    }
    const base = baseByKey.get(`${m.group}/${m.name}`);
    let change = "—";
    let flag = "";
    if (base && base.value > 0) {
      const pct = ((m.value - base.value) / base.value) * 100;
      const band = m.unit === "ms" ? NOISE_PCT : NOISE_PCT_BYTES;
      change = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      if (pct > band) {
        flag = "  REGRESSION";
        regressions++;
      } else if (pct < -band) {
        flag = "  improved";
      }
    }
    console.log(
      `    ${m.name.padEnd(24)}${fmt(m).padStart(11)}` +
        `${(base ? fmt(base) : "—").padStart(12)}${change.padStart(12)}${flag}`,
    );
  }
  return regressions;
}

function main() {
  const args = process.argv.slice(2);
  const reportOnly = args.includes("--report-only");
  const saveAt = args.indexOf("--save");
  const saveName = saveAt >= 0 ? args[saveAt + 1] : null;

  if (!reportOnly && !saveName) {
    console.log("Running e2e/reader-performance.spec.ts (real pdf.js, real range server)…\n");
    const run = spawnSync(
      "npx",
      ["playwright", "test", "e2e/reader-performance.spec.ts", "--reporter=line"],
      { cwd: ROOT, stdio: "inherit", env: process.env },
    );
    // A failed assertion still leaves usable measurements behind, and those
    // are exactly the ones worth looking at — so report either way, and let
    // the comparison below decide the exit code.
    if (run.status !== 0) {
      console.log("\n  (the spec reported failures — measurements below are from that run)");
    }
  }

  const projects = projectsIn(REPORT_DIR);
  if (projects.length === 0) {
    console.log(
      "\nNo reader measurements found.\n" +
        "Run `npm run reader:benchmark` (it drives the Playwright spec), or\n" +
        "`npx playwright test e2e/reader-performance.spec.ts` directly.\n" +
        "The large PDF fixtures are generated by the spec on first run.",
    );
    process.exit(0);
  }

  if (saveName) {
    mkdirSync(BASELINE_DIR, { recursive: true });
    let saved = 0;
    for (const f of readdirSync(REPORT_DIR)) {
      if (!f.endsWith(".json")) continue;
      writeFileSync(
        path.join(BASELINE_DIR, `baseline-${saveName}-${f}`),
        readFileSync(path.join(REPORT_DIR, f)),
      );
      saved++;
    }
    console.log(`Saved ${saved} report(s) as baseline "${saveName}".`);
    return;
  }

  console.log("\nREADER BENCHMARK");
  console.log(`  measurements: reports/reader-performance/`);
  console.log(`  baseline:     docs/reader-performance/`);
  console.log(`  noise band:   ±${NOISE_PCT}% wall-clock, ±${NOISE_PCT_BYTES}% bytes and memory`);

  let regressions = 0;
  for (const project of projects) regressions += report(project);

  console.log("");
  if (regressions > 0) {
    console.log(`  ${regressions} metric(s) regressed beyond the noise band.`);
    process.exit(1);
  }
  console.log("  No regressions beyond the noise band.");
}

main();
