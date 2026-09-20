// The librarian's queue: what it ranks, and what it must never do.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildContributorTrustReport } from "./contributor-trust-report";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const row = (name: string, workCount: number, slug = name.toLowerCase().replace(/\s+/g, "-")) => ({
  slug,
  name,
  workCount,
});

describe("buildContributorTrustReport", () => {
  it("reports nothing for a clean roster", () => {
    const report = buildContributorTrustReport([row("Louis Cohen", 3), row("UNESCO", 6)]);
    expect(report.findings).toEqual([]);
    expect(report.counts).toEqual({ checked: 2, suppressed: 0, flagged: 0, worksAffected: 0 });
  });

  it("ranks by consequence, not by row count", () => {
    // Ten junk rows with one book each matter less than one junk row with 621,
    // which is the actual shape of this library's problem.
    const report = buildContributorTrustReport([
      row("Windows User", 7),
      row("Channa 0977 33 61 62", 621),
      row("PC", 1),
    ]);
    expect(report.findings.map((f) => f.workCount)).toEqual([621, 7, 1]);
    expect(report.counts.worksAffected).toBe(629);
  });

  it("puts what has already changed above what is waiting for a person", () => {
    const report = buildContributorTrustReport([
      row("Computer Teacher", 900), // suspicious, nothing changed
      row("PC", 1), // invalid, already withdrawn
    ]);
    expect(report.findings.map((f) => f.trust)).toEqual(["invalid", "suspicious"]);
    expect(report.counts).toEqual({ checked: 2, suppressed: 1, flagged: 1, worksAffected: 1 });
  });

  it("counts works only for rows that were actually withdrawn", () => {
    // A flagged row is still listed and still credited, so its works are not
    // "affected" — reporting them would overstate the damage by the size of
    // the advisory list.
    const report = buildContributorTrustReport([row("sokhavuth", 40)]);
    expect(report.counts.worksAffected).toBe(0);
    expect(report.counts.flagged).toBe(1);
  });

  it("is stable between two loads of the same data", () => {
    const rows = [row("PC", 1), row("LENOVO", 1), row("user", 1)];
    const a = buildContributorTrustReport(rows).findings.map((f) => f.slug);
    const b = buildContributorTrustReport([...rows].reverse()).findings.map((f) => f.slug);
    expect(a).toEqual(b);
  });

  it("caps the list without losing the totals", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(`user`, 1, `junk-${i}`));
    const report = buildContributorTrustReport(rows, 5);
    expect(report.findings).toHaveLength(5);
    expect(report.counts.suppressed).toBe(40);
  });
});

describe("the panel reports; it does not repair", () => {
  it("opens no write path", () => {
    const source = read("lib/admin/contributor-trust-report.ts");
    for (const write of [".update(", ".delete(", ".insert(", ".upsert(", ".rpc("]) {
      expect(source).not.toContain(write);
    }
  });

  it("stays pure — no database, no server-only, no fetch", () => {
    const source = read("lib/admin/contributor-trust-report.ts");
    expect(source).not.toContain("server-only");
    expect(source).not.toContain("createServiceClient");
    expect(source).not.toContain("fetch(");
  });

  it("is guarded before it opens the roster's service client", () => {
    const source = read("app/actions/data-quality.ts");
    const fn = source.slice(source.indexOf("export async function getContributorTrustReport"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body.indexOf("requirePermission")).toBeGreaterThan(-1);
    expect(body.indexOf("requirePermission")).toBeLessThan(body.indexOf("getAuthorDirectory"));
  });
});

describe("the public surfaces honour the rule", () => {
  it("the sitemap drops an unidentified name without needing the roster", () => {
    // The roster read can fail, and this file deliberately emits UNFILTERED
    // when it does. That fallback is right for the works rule, which needs a
    // database; it is not right for this one, which needs nothing.
    const source = read("app/sitemap.ts");
    expect(source).toMatch(/normalizeByline\([^)]*\)\.unidentified/);
    expect(source).toContain("unidentified(a.name)");
    expect(source).toContain("unidentified(a.full_name)");
  });

  it("the author page withdraws itself as well as leaving the sitemap", () => {
    // Removing a URL from a sitemap stops RECOMMENDING it; only `noindex`
    // withdraws a page already in the index.
    const source = read("app/[locale]/(public)/authors/[slug]/page.tsx");
    const guard = source.slice(source.indexOf("normalizeByline(author.name).unidentified"));
    expect(guard.slice(0, 120)).toContain("index: false");
  });

  it("the public roster filters on identity, not only on work count", () => {
    const source = read("lib/authors/directory.ts");
    expect(source).toContain("a.workCount > 0 && a.identified");
  });
});
