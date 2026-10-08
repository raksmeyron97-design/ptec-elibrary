import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readZipEntries } from "@/lib/seo/gsc/zip";
import { parseCsv, readExport, readTable } from "@/lib/seo/gsc/export";
import { computeKpi, formatKpi, querySegment, type KpiConfig, type RuleSet } from "@/lib/seo/gsc/kpi";

/** A real ZIP, built by hand: one local header per entry, a central directory, an EOCD. */
function zip(entries: Record<string, string>, deflate = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = Buffer.from(text, "utf8");
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const QUERIES = 'Top queries,Clicks,Impressions,CTR,Position\nptec library,40,200,20%,1.5\n"ថ្នាក់ទី៩ សិក្សាសង្គម",10,500,2%,6.2\nasdfgh,0,30,0%,40\n';
const PAGES = "Top pages,Clicks,Impressions,CTR,Position\nhttps://library.ptec.edu.kh/books/a,30,300,10%,3\nhttps://library.ptec.edu.kh/subjects/x,5,100,5%,8\n";

describe("readZipEntries", () => {
  it("reads stored and deflated entries, Khmer included", () => {
    for (const deflate of [false, true]) {
      const files = readZipEntries(zip({ "Queries.csv": QUERIES, "Pages.csv": PAGES }, deflate));
      expect(files.get("Queries.csv")?.toString("utf8")).toBe(QUERIES);
      expect(files.get("Pages.csv")?.toString("utf8")).toBe(PAGES);
    }
  });

  it("refuses something that is not a ZIP", () => {
    expect(() => readZipEntries(Buffer.from("not a zip at all, just text"))).toThrow(/not a ZIP/);
  });
});

describe("the export readers", () => {
  it("parses quoted fields, doubled quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("reads CTR percentages as fractions", () => {
    expect(readTable(QUERIES)?.[0]).toEqual({ key: "ptec library", clicks: 40, impressions: 200, ctr: 0.2, position: 1.5 });
  });

  it("a missing column is null, and a missing file is listed — never zero", () => {
    const rows = readTable("Top queries,Clicks\nx,3\n");
    expect(rows?.[0]).toMatchObject({ clicks: 3, impressions: null, position: null });
    const data = readExport(new Map([["Queries.csv", QUERIES]]));
    expect(data.pages).toBeNull();
    expect(data.missing).toEqual(expect.arrayContaining(["Pages.csv", "Dates.csv"]));
  });
});

describe("the KPI engine", () => {
  const rules: RuleSet = { noise: ["^asdf"], brand: ["\\bptec\\b"], clusters: { social_studies: ["សិក្សាសង្គម"] } };
  const data = readExport(new Map([["Queries.csv", QUERIES], ["Pages.csv", PAGES]]));

  it("a noise query is excluded, a brand query counts as brand, a Khmer query lands in its cluster", () => {
    expect(querySegment("asdfgh", rules).noise).toBe(true);
    expect(querySegment("ptec library", rules).brand).toBe(true);
    expect(querySegment("ថ្នាក់ទី៩ សិក្សាសង្គម", rules).clusters).toEqual(["social_studies"]);
    expect(computeKpi({ table: "queries", metric: "impressions", excludeNoise: true }, data, rules)).toBe(700);
    expect(computeKpi({ table: "queries", metric: "clicks", segment: "nonbrand", excludeNoise: true }, data, rules)).toBe(10);
    expect(computeKpi({ table: "queries", metric: "clicks", segment: "cluster:social_studies" }, data, rules)).toBe(10);
  });

  it("CTR and position are impression-weighted", () => {
    expect(computeKpi({ table: "pages", metric: "ctr" }, data, rules)).toBeCloseTo(35 / 400);
    expect(computeKpi({ table: "pages", metric: "position" }, data, rules)).toBeCloseTo((3 * 300 + 8 * 100) / 400);
    expect(computeKpi({ table: "pages", metric: "rows", pathPrefix: "/books/" }, data, rules)).toBe(1);
  });

  it("anything it cannot compute is null and prints [UNKNOWN]", () => {
    expect(computeKpi(null, data, rules)).toBeNull();
    expect(computeKpi({ table: "dates", metric: "clicks" }, data, rules)).toBeNull();
    expect(computeKpi({ table: "queries", metric: "clicks", segment: "brand" }, data, { ...rules, brand: [] })).toBeNull();
    expect(computeKpi({ table: "queries", metric: "clicks", excludeNoise: true }, data, { ...rules, noise: [] })).toBeNull();
    expect(computeKpi({ table: "queries", metric: "clicks", segment: "cluster:nope" }, data, rules)).toBeNull();
    const noPosition = readExport(new Map([["Pages.csv", "Top pages,Clicks,Impressions\nx,1,2\n"]]));
    expect(computeKpi({ table: "pages", metric: "position" }, noPosition, rules)).toBeNull();
    expect(formatKpi(null, "clicks")).toBe("[UNKNOWN]");
    expect(formatKpi(0, "clicks")).toBe("0");
  });
});

describe("scripts/seo/gsc-rules.json", () => {
  const cfg = JSON.parse(readFileSync(path.resolve(__dirname, "../../../scripts/seo/gsc-rules.json"), "utf8")) as {
    rules: RuleSet;
    kpis: KpiConfig[];
  };

  it("names the audit's KPI rows", () => {
    const ids = cfg.kpis.map((k) => k.id);
    expect(ids).toEqual(expect.arrayContaining(["K-S1", "K-S4", "K-C1", "K-C2", "K-P1", "K-P8"]));
  });

  it("invents nothing: every definition and rule is empty until copied from the audit", () => {
    expect(cfg.kpis.every((k) => k.definition === null)).toBe(true);
    expect(cfg.rules).toEqual({ noise: [], brand: [], clusters: {} });
  });
});
