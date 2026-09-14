import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compareIndexableSets,
  graduationMessage,
  hubSlug,
  shouldAlert,
  shouldRecordBaseline,
} from "./subject-graduation";

const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");
const cmp = (current: string[], previous: string[] | null, incomplete = false) =>
  compareIndexableSets({ current, previous, incomplete });

describe("a hub graduating or falling back", () => {
  it("reports a hub that newly meets the depth gate", () => {
    // The live case this exists for: a librarian publishes the 5th book in
    // ភាសា and the gate flips it with no deploy.
    const out = cmp(["math", "research", "language"], ["math", "research"]);
    expect(out.kind).toBe("changed");
    if (out.kind !== "changed") throw new Error("unreachable");
    expect(out.graduated).toEqual(["language"]);
    expect(out.demoted).toEqual([]);
    expect(shouldAlert(out)).toBe(true);
  });

  it("reports a hub that stopped meeting it", () => {
    const out = cmp(["math"], ["math", "language"]);
    if (out.kind !== "changed") throw new Error("expected changed");
    expect(out.graduated).toEqual([]);
    expect(out.demoted).toEqual(["language"]);
  });

  it("reports both directions in one run", () => {
    const out = cmp(["math", "law"], ["math", "language"]);
    if (out.kind !== "changed") throw new Error("expected changed");
    expect(out.graduated).toEqual(["law"]);
    expect(out.demoted).toEqual(["language"]);
  });

  it("stays silent when the set is identical", () => {
    const out = cmp(["math", "research"], ["research", "math"]);
    expect(out.kind).toBe("unchanged");
    expect(shouldAlert(out)).toBe(false);
  });

  it("is order- and duplicate-insensitive", () => {
    expect(cmp(["b", "a", "a"], ["a", "b"]).kind).toBe("unchanged");
  });
});

// Every case below is one where a naive diff would fire a confident, wrong
// alert. They are the reason this module is pure and separately tested.
describe("an absent or partial previous reading is never a change", () => {
  it("BOOTSTRAPS on the first run instead of announcing 19 graduations", () => {
    const out = cmp(["a", "b", "c"], null);
    expect(out.kind).toBe("bootstrap");
    expect(shouldAlert(out)).toBe(false);
    // …but it does become the baseline, or it would bootstrap forever.
    expect(shouldRecordBaseline(out)).toBe(true);
  });

  it("does NOT compare an incomplete run — a partial set looks like mass demotion", () => {
    const out = cmp(["math"], ["math", "research", "language"], true);
    expect(out.kind).toBe("incomplete");
    expect(shouldAlert(out)).toBe(false);
  });

  it("does NOT let an incomplete run become the baseline", () => {
    // Recording a short set would make the NEXT run report the missing hubs
    // as fresh graduations — one outage, two false alerts.
    const out = cmp(["math"], ["math", "research"], true);
    expect(shouldRecordBaseline(out)).toBe(false);
  });

  it("checks incompleteness BEFORE the missing baseline", () => {
    // An incomplete FIRST run must not bootstrap a partial set as the
    // baseline every later run is judged against.
    const out = cmp(["math"], null, true);
    expect(out.kind).toBe("incomplete");
    expect(shouldRecordBaseline(out)).toBe(false);
  });

  it("treats a genuinely empty previous set as data, not as missing", () => {
    // Only a COMPLETE run writes the baseline, so an empty one means the gate
    // really did exclude everything — that is a change worth hearing about.
    const out = cmp(["math"], []);
    if (out.kind !== "changed") throw new Error("expected changed");
    expect(out.graduated).toEqual(["math"]);
  });

  it("reports everything leaving the set, which is alarming and should be", () => {
    const out = cmp([], ["math", "research"]);
    if (out.kind !== "changed") throw new Error("expected changed");
    expect(out.demoted).toEqual(["math", "research"]);
  });
});

describe("the message names what moved, not just how many", () => {
  it("names graduated and demoted hubs and the new total", () => {
    const msg = graduationMessage(cmp(["math", "law"], ["math", "language"]));
    expect(msg).toContain("law");
    expect(msg).toContain("language");
    expect(msg).toContain("2 hub(s) are indexable in total");
  });

  it("is empty for every non-change, so a caller cannot alert by accident", () => {
    for (const o of [cmp(["a"], ["a"]), cmp(["a"], null), cmp(["a"], ["a", "b"], true)]) {
      expect(graduationMessage(o)).toBe("");
    }
  });
});

describe("hubSlug", () => {
  it("takes the slug out of a subject path, Khmer included", () => {
    expect(hubSlug("/subjects/ស្រាវជ្រាវ")).toBe("ស្រាវជ្រាវ");
    expect(hubSlug("/subjects/math")).toBe("math");
  });

  it("leaves anything else alone", () => {
    expect(hubSlug("ស្រាវជ្រាវ")).toBe("ស្រាវជ្រាវ");
    expect(hubSlug("/books/x")).toBe("/books/x");
  });
});

describe("the verifier feeds this the SET, not a count", () => {
  it("emits indexableSlugs, sorted", () => {
    const src = read("scripts/verify-subject-indexability.ts");
    expect(src).toContain("indexableSlugs:");
    expect(src).toContain(".sort()");
  });

  it("carries the incomplete flag the comparison depends on", () => {
    expect(read("scripts/verify-subject-indexability.ts")).toContain("incomplete: t.unknown > 0");
  });
});

// ── The workflow's fragile parts. Source scans, because YAML runs nowhere
// else and each of these has a known way of failing silently.
describe(".github/workflows/subject-gate.yml", () => {
  const wf = read(".github/workflows/subject-gate.yml");

  it("reads PIPESTATUS once, into a variable", () => {
    // PIPESTATUS is rebuilt by the NEXT command, so a second read returns 0
    // and the job is permanently green. That exact bug was caught in #185.
    expect(wf).toContain("rc=${PIPESTATUS[0]}");
    expect((wf.match(/PIPESTATUS/g) ?? []).length).toBeLessThanOrEqual(2); // the read + the comment
  });

  it("publishes the baseline only when one was actually written", () => {
    // The checker refuses to write after an incomplete run; without this guard
    // the upload step would fail the job, or publish a stale file.
    expect(wf).toContain("hashFiles('baseline/subject-indexable-baseline.json') != ''");
  });

  it("uses one artifact name for download, read and upload", () => {
    const names = [...wf.matchAll(/subject-indexable-baseline/g)];
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(wf).toContain("--name subject-indexable-baseline --dir prev");
    expect(wf).toContain("prev/subject-indexable-baseline.json");
  });

  it("treats a missing previous baseline as bootstrap, never as failure", () => {
    expect(wf).toContain("continue-on-error: true");
    expect(wf).toMatch(/bootstrap/i);
  });

  it("alerts Sev 4 for a set change and Sev 2 only for a broken gate", () => {
    // A graduation is a librarian doing their job. Paging for it is how the
    // channel stops being read.
    const change = wf.slice(wf.indexOf("Telegram notice (indexable set changed)"));
    expect(change).toContain('severity: "4"');
    const broken = wf.slice(wf.indexOf("Telegram alert (gate broken)"), wf.indexOf("Telegram alert (gate recovered)"));
    expect(broken).toContain('severity: "2"');
    expect(broken).toContain("failure() && steps.previous.outputs.conclusion == 'success'");
  });

  it("asks the membership question even when the gate check failed", () => {
    expect(wf).toMatch(/id: graduation[\s\S]{0,80}if: always\(\)/);
  });
});
