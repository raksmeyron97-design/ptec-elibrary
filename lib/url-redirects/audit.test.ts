// The retired-URL audit's rules (lib/url-redirects/audit.ts). Every case is a
// way the previous reporting could have called a dead URL fixed — above all,
// a target's 200 standing in for the source.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  analyseChain,
  classifyRecord,
  parseSeedRows,
  reconcile,
  type AuditedRecord,
  type ChainProbe,
  type Hop,
  type QueueState,
  type RecordEvidence,
} from "./audit";

const BASE = "https://library.ptec.edu.kh";
const SRC = "/books/old-title";
const DEST = "/books/old-title-5th-edition";

const hop = (p: string, status: number, location: string | null = null, robots: string | null = null): Hop => ({
  url: `${BASE}${p}`,
  status,
  location,
  robots,
});
const final = (...hops: Hop[]): ChainProbe => ({ kind: "answered", hops, stop: "final", canonical: null });
const redirectTo = (from: string, to: string, status = 301): ChainProbe => final(hop(from, status, to), hop(to, 200));
const status = (p: string, s: number, robots: string | null = null): ChainProbe => final(hop(p, s, null, robots));

const pending: QueueState = { resolution: "pending", suggestedPath: null, cause: "seeded", decidedByPerson: false, deciderRole: null, resolvedAt: null };

function evidence(over: Partial<RecordEvidence> = {}): RecordEvidence {
  return {
    path: SRC,
    seededSuggestion: null,
    queue: pending,
    redirectRow: null,
    alias: null,
    probes: { en: status(SRC, 404), km: status(`/km${SRC}`, 404) },
    target: null,
    confirmation: null,
    ...over,
  };
}

const confirmed = { path: SRC, target: DEST, verdict: "supported" as const, basis: "replacement_edition", confirmedBy: "librarian", confirmedAt: "2026-10-20" };
const personRow = { targetPath: DEST, status: 301, decidedByPerson: true };
const redirected: QueueState = { ...pending, resolution: "redirected", decidedByPerson: true, deciderRole: "librarian" };
const bothRedirect = (s = 301) => ({ en: redirectTo(SRC, DEST, s), km: redirectTo(`/km${SRC}`, `/km${DEST}`, s) });

describe("resolution requires the SOURCE, not the target", () => {
  it("1. 301 to a valid, confirmed successor is RESOLVED_REDIRECT", () => {
    const v = classifyRecord(evidence({ queue: redirected, redirectRow: personRow, probes: bothRedirect(), confirmation: confirmed }));
    expect(v.classification).toBe("RESOLVED_REDIRECT");
    expect(v.semantic).toBe("SUPPORTED");
    expect(v.observedTarget).toBe(DEST);
  });

  it("2. a 308 chain resolves under the same policy", () => {
    const v = classifyRecord(evidence({ queue: redirected, redirectRow: personRow, probes: bothRedirect(308), confirmation: confirmed }));
    expect(v.classification).toBe("RESOLVED_REDIRECT");
  });

  it("3. a target answering 200 while the source answers 404 stays unresolved", () => {
    const v = classifyRecord(
      evidence({ queue: { ...pending, suggestedPath: DEST }, target: { path: DEST, probe: status(DEST, 200) } }),
    );
    expect(v.classification).toBe("TARGET_AVAILABLE_SOURCE_UNRESOLVED");
    expect(v.targetAvailable).toBe(true);
    expect(v.semantic).toBe("UNVERIFIED");
  });

  it("4. a redirect to a target answering 404 does not pass", () => {
    const probes = {
      en: final(hop(SRC, 301, DEST), hop(DEST, 404)),
      km: final(hop(`/km${SRC}`, 301, `/km${DEST}`), hop(`/km${DEST}`, 404)),
    };
    const v = classifyRecord(evidence({ queue: redirected, redirectRow: personRow, probes, confirmation: confirmed }));
    expect(v.classification).toBe("BROKEN_REDIRECT");
    expect(v.reasons.join()).toMatch(/final_status_404/);
  });

  it("5. a redirect to an unrelated 200 page does not pass semantic review", () => {
    const unrelated = { en: redirectTo(SRC, "/books/cooking"), km: redirectTo(`/km${SRC}`, "/km/books/cooking") };
    const row = { ...personRow, targetPath: "/books/cooking" };
    const unreviewed = classifyRecord(evidence({ queue: redirected, redirectRow: row, probes: unrelated }));
    expect(unreviewed.classification).toBe("SOURCE_REDIRECTS_TARGET_UNVERIFIED");
    expect(unreviewed.semantic).toBe("UNVERIFIED");
    const rejected = classifyRecord(
      evidence({ queue: redirected, redirectRow: row, probes: unrelated, confirmation: { ...confirmed, target: "/books/cooking", verdict: "incorrect" } }),
    );
    expect(rejected.classification).toBe("BROKEN_REDIRECT");
    expect(rejected.semantic).toBe("INCORRECT");
  });

  it("6. a loop fails", () => {
    const loop: ChainProbe = { kind: "answered", hops: [hop(SRC, 301, DEST), hop(DEST, 301, SRC)], stop: "loop", canonical: null };
    const v = classifyRecord(evidence({ probes: { en: loop, km: loop }, redirectRow: personRow }));
    expect(v.classification).toBe("BROKEN_REDIRECT");
    expect(v.reasons.join()).toMatch(/en:loop/);
  });

  it("7. a chain over the one-hop policy is flagged", () => {
    const two = final(hop(SRC, 301, "/books/mid"), hop("/books/mid", 301, DEST), hop(DEST, 200));
    const twoKm = final(hop(`/km${SRC}`, 301, "/km/books/mid"), hop("/km/books/mid", 301, `/km${DEST}`), hop(`/km${DEST}`, 200));
    const v = classifyRecord(evidence({ queue: redirected, redirectRow: personRow, probes: { en: two, km: twoKm }, confirmation: confirmed }));
    expect(v.classification).toBe("BROKEN_REDIRECT");
    expect(v.reasons.join()).toMatch(/hops_2_over_1/);
    const runaway: ChainProbe = { kind: "answered", hops: Array.from({ length: 6 }, (_, i) => hop(`/books/h${i}`, 301, `/books/h${i + 1}`)), stop: "follow_limit", canonical: null };
    const o = analyseChain(runaway, "");
    expect(o.kind === "redirect" ? o.defects : []).toContain("follow_limit");
  });

  it("8. a 5xx or a timeout is NOT_VERIFIED, never a 404 and never resolved", () => {
    const noAnswer: ChainProbe = { kind: "no_answer", hops: [], detail: "HTTP 502 for …" };
    const timedOut: ChainProbe = { kind: "no_answer", hops: [hop(SRC, 301, DEST)], detail: "no answer after 3 attempt(s)" };
    for (const probes of [{ en: noAnswer, km: status(`/km${SRC}`, 404) }, { en: timedOut, km: timedOut }]) {
      const v = classifyRecord(evidence({ queue: redirected, redirectRow: personRow, probes, confirmation: confirmed }));
      expect(v.classification).toBe("NOT_VERIFIED");
    }
    const r = reconcile([{ path: SRC, suggested: null, note: "" }], [
      { id: "x", path: SRC, evidence: evidence({ probes: { en: noAnswer, km: noAnswer } }), verdict: classifyRecord(evidence({ probes: { en: noAnswer, km: noAnswer } })) },
    ], true);
    expect(r.observed404).toBe(0);
    expect(r.fullyResolved).toBe(0);
  });

  it("9. no suggested target stays review-required unless a retirement is approved and confirmed", () => {
    expect(classifyRecord(evidence()).classification).toBe("NO_SUCCESSOR_REVIEW_REQUIRED");
    const gone = { en: status(SRC, 410, "noindex"), km: status(`/km${SRC}`, 410, "noindex") };
    const approved = classifyRecord(
      evidence({ probes: gone, queue: { ...pending, resolution: "gone", decidedByPerson: true }, redirectRow: { targetPath: null, status: 410, decidedByPerson: true } }),
    );
    expect(approved.classification).toBe("RESOLVED_RETIRED");
  });

  it("10. a redirect row the database holds but production does not serve is reported as observed", () => {
    const v = classifyRecord(evidence({ queue: redirected, redirectRow: personRow }));
    expect(v.classification).toBe("DECISION_NOT_EFFECTIVE");
    expect(v.observedTarget).toBeNull();
    const elsewhere = classifyRecord(
      evidence({ queue: redirected, redirectRow: personRow, probes: { en: redirectTo(SRC, "/books/other"), km: redirectTo(`/km${SRC}`, "/km/books/other") }, confirmation: confirmed }),
    );
    expect(elsewhere.classification).toBe("SOURCE_REDIRECTS_TARGET_UNVERIFIED");
    expect(elsewhere.discrepancies.join()).toMatch(/database records \/books\/old-title-5th-edition/);
  });

  it("11. duplicate seed paths and locale variants never inflate the record count", () => {
    const seed = [
      { path: SRC, suggested: null, note: "" },
      { path: SRC, suggested: null, note: "" },
      { path: "/books/b", suggested: null, note: "" },
    ];
    const recs: AuditedRecord[] = [SRC, "/books/b"].map((p) => {
      const ev = evidence({ path: p, probes: { en: status(p, 404), km: status(`/km${p}`, 404) } });
      return { id: p, path: p, evidence: ev, verdict: classifyRecord(ev) };
    });
    const r = reconcile(seed, recs, true);
    expect(r.originalRecords).toBe(2);
    expect(r.duplicateSeedEntries).toEqual([SRC]);
    expect(r.sourceChecks).toBe(4);
    expect(Object.values(r.byClassification).reduce((a, b) => a + b, 0)).toBe(2);
    expect(r.accountedFor).toBe(true);
    expect(reconcile(seed, recs.slice(0, 1), true).accountedFor).toBe(false);
  });

  it("12. unsafe targets are refused — a stored suggestion outside the queue's collections, an off-site hop, a malformed row", () => {
    const external = classifyRecord(evidence({ queue: { ...pending, suggestedPath: "https://evil.example/x" }, target: { path: "https://evil.example/x", probe: status("/x", 200) } }));
    expect(external.suggestionUnsafe).toBe(true);
    expect(external.classification).toBe("SOURCE_404_REVIEW_REQUIRED");
    const offSite: ChainProbe = { kind: "answered", hops: [hop(SRC, 301, "https://evil.example/")], stop: "off_site", canonical: null };
    expect(classifyRecord(evidence({ probes: { en: offSite, km: offSite } })).classification).toBe("BROKEN_REDIRECT");
    const malformed = classifyRecord(evidence({ queue: redirected, redirectRow: { targetPath: "not-a-path", status: 301, decidedByPerson: true } }));
    expect(malformed.discrepancies.join()).toMatch(/refused by the edge gate/);
  });

  it("13. a 410 without an approved retirement is not a retirement", () => {
    const gone = { en: status(SRC, 410, "noindex"), km: status(`/km${SRC}`, 410, "noindex") };
    expect(classifyRecord(evidence({ probes: gone })).classification).toBe("SOURCE_410_UNAPPROVED");
    // Approved, but served without noindex: still not accepted.
    const noRobots = classifyRecord(
      evidence({
        probes: { en: status(SRC, 410), km: status(`/km${SRC}`, 410) },
        queue: { ...pending, resolution: "gone", decidedByPerson: true },
        redirectRow: { targetPath: null, status: 410, decidedByPerson: true },
      }),
    );
    expect(noRobots.classification).toBe("SOURCE_410_UNAPPROVED");
  });

  it("14. HTTP success never implies semantic equivalence — not even with a person's queue decision", () => {
    const v = classifyRecord(evidence({ queue: redirected, redirectRow: personRow, probes: bothRedirect() }));
    expect(v.classification).toBe("SOURCE_REDIRECTS_TARGET_UNVERIFIED");
    expect(v.approval).toBe("PERSON_DECISION");
    expect(v.semantic).toBe("UNVERIFIED");
    // The same record (a rename the trigger captured) IS evidence of equivalence.
    const rename = classifyRecord(evidence({ queue: redirected, redirectRow: { ...personRow, decidedByPerson: false }, probes: bothRedirect() }));
    expect(rename.classification).toBe("RESOLVED_REDIRECT");
    // A confirmation for a DIFFERENT target confirms nothing here.
    const otherPair = classifyRecord(evidence({ queue: redirected, redirectRow: personRow, probes: bothRedirect(), confirmation: { ...confirmed, target: "/books/x" } }));
    expect(otherPair.semantic).toBe("UNVERIFIED");
  });
});

describe("locales and chain details", () => {
  it("a /km redirect that drops the locale is broken", () => {
    const v = classifyRecord(
      evidence({ queue: redirected, redirectRow: personRow, probes: { en: redirectTo(SRC, DEST), km: redirectTo(`/km${SRC}`, DEST) }, confirmation: confirmed }),
    );
    expect(v.classification).toBe("BROKEN_REDIRECT");
    expect(v.reasons.join()).toMatch(/km:locale_dropped/);
  });

  it("locales that answer differently are a defect, not an average", () => {
    const v = classifyRecord(evidence({ probes: { en: redirectTo(SRC, DEST), km: status(`/km${SRC}`, 404) } }));
    expect(v.classification).toBe("BROKEN_REDIRECT");
  });

  it("a temporary redirect is not a resolution", () => {
    const v = classifyRecord(evidence({ queue: redirected, redirectRow: personRow, probes: bothRedirect(302), confirmation: confirmed }));
    expect(v.classification).toBe("BROKEN_REDIRECT");
    expect(v.reasons.join()).toMatch(/temporary_redirect/);
  });

  it("decodes Khmer paths before comparing", () => {
    const km = "/books/ថ្នាក់ទី៩";
    const enc = km.split("/").map(encodeURIComponent).join("/");
    const o = analyseChain(final(hop(enc, 301, enc), hop(enc, 200)), "");
    expect(o.kind === "redirect" && o.finalPath).toBe(km);
  });

  it("an ignored queue row is not a resolution", () => {
    const v = classifyRecord(evidence({ queue: { ...pending, resolution: "ignored", decidedByPerson: true } }));
    expect(v.classification).toBe("SOURCE_404_IGNORED");
  });

  it("a suggestion whose target could not be checked is NOT_VERIFIED, not available", () => {
    const v = classifyRecord(evidence({ queue: { ...pending, suggestedPath: DEST }, target: { path: DEST, probe: { kind: "no_answer", hops: [], detail: "timeout" } } }));
    expect(v.classification).toBe("NOT_VERIFIED");
    expect(v.targetAvailable).toBeNull();
  });

  it("an unreadable queue is reported, and a missing queue row is a discrepancy", () => {
    expect(classifyRecord(evidence({ queue: "missing" })).discrepancies.join()).toMatch(/not in retired_url_queue/);
    expect(classifyRecord(evidence({ queue: "unavailable" })).approval).toBe("UNKNOWN");
  });
});

describe("the original population", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/0171_seed_retired_urls.sql"), "utf8");
  const rows = parseSeedRows(sql);

  it("parses every 0171 tuple with its note, without hardcoding the count", () => {
    const tuples = (sql.slice(sql.indexOf("with seed"), sql.indexOf("),\njudged")).match(/^\s*\('\/books\//gm) ?? []).length;
    expect(rows).toHaveLength(tuples);
    expect(rows.every((r) => r.note.length > 0)).toBe(true);
    expect(rows.find((r) => r.path === "/books/action-research-a-guide-for-the-teacher-researcher")?.suggested).toBeNull();
  });

  it("refuses a file without the seed list rather than reporting zero records", () => {
    expect(() => parseSeedRows("select 1;")).toThrow(/not found/);
  });
});

describe("the collector is read-only", () => {
  const src = readFileSync(path.resolve(__dirname, "../../scripts/audit-retired-urls.ts"), "utf8");
  it("issues GET and nothing else, and never reads the private reason", () => {
    expect(src).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"/);
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(src).not.toMatch(/createClient/);
    expect(src).not.toMatch(/select=[^"`]*\breason\b/);
    expect(src).toMatch(/method: "GET"/);
  });
});
