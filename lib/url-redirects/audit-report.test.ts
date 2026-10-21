// The audit's output side (lib/url-redirects/audit-report.ts): what it asks
// PostgREST, where it may write, and how network evidence is rendered. The
// evidence is untrusted by construction — titles, Location headers,
// canonical links — so every format is exercised with hostile text.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  mdText,
  postgrestInFilter,
  postgrestQuoted,
  renderCsv,
  renderMarkdown,
  resolveReportBase,
  writeReportFile,
  type ReportContext,
} from "./audit-report";
import { classifyRecord, reconcile, type AuditedRecord, type ChainProbe, type RecordEvidence } from "./audit";

// ── PostgREST `in.()` ───────────────────────────────────────────────────────

/**
 * PostgREST v14's list grammar, as verified against production on 2026-10-21:
 * an element is either "quoted" — where `\` escapes the next character — or a
 * bare run up to `,` or `)`. Parses the DECODED text inside `in.(…)`.
 */
function parseInList(list: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    let v = "";
    if (list.charAt(i) === '"') {
      i++;
      while (i < list.length && list.charAt(i) !== '"') {
        if (list.charAt(i) === "\\") i++;
        v += list.charAt(i);
        i++;
      }
      if (list.charAt(i) !== '"') throw new Error("unterminated quoted value");
      i++;
    } else {
      while (i < list.length && list.charAt(i) !== "," && list.charAt(i) !== ")") {
        v += list.charAt(i);
        i++;
      }
    }
    out.push(v);
    if (i >= list.length) return out;
    if (list.charAt(i) !== ",") throw new Error(`unexpected ${JSON.stringify(list.charAt(i))} at ${i}`);
    i++;
  }
}

const decodeFilter = (filter: string) => {
  expect(filter.startsWith("in.(") && filter.endsWith(")")).toBe(true);
  return decodeURIComponent(filter.slice("in.(".length, -1));
};

describe("postgrestInFilter: a value means exactly itself", () => {
  const hostile = [
    "plain-slug",
    "back\\slash",
    "trailing\\",
    "\\\\double",
    'quo"te',
    'ends"',
    "comma,inside",
    "close)paren",
    "(open",
    "dot.colon:",
    'mix\\",)(',
    '\\"',
    "ថ្នាក់ទី៩-សិក្សាសង្គម",
    "ក,\\\"ខ)",
    "a&b=c#d%25?",
  ];

  it.each(hostile)("round-trips %j as ONE element", (value) => {
    expect(parseInList(decodeFilter(postgrestInFilter([value])))).toEqual([value]);
  });

  it("keeps a list of hostile values as exactly that many elements, in order", () => {
    expect(parseInList(decodeFilter(postgrestInFilter(hostile)))).toEqual(hostile);
  });

  it("leaves nothing raw that could split the list or the query string", () => {
    // ( and ) may stay raw: PostgREST percent-decodes before it parses, and
    // inside quotes they are value characters — the round trips above prove it.
    const filter = postgrestInFilter(['a"b,c)d&e=f#g h', "ក"]);
    expect(filter.slice(4, -1)).not.toMatch(/[",&=#\s]/);
  });

  it("the old quote-only escape let a trailing backslash swallow the closing quote (negative control)", () => {
    // What the old escape (quotes only) produced for the value `abc\`, written
    // out rather than re-implemented — a copy of a defective escape in a test
    // is itself a CodeQL finding (#164).
    const oldOutput = '"abc\\"';
    expect(postgrestQuoted("abc\\")).not.toBe(oldOutput);
    expect(() => parseInList(oldOutput)).toThrow(/unterminated/);
  });

  it("refuses what no slug or id contains rather than encoding it", () => {
    expect(() => postgrestQuoted("")).toThrow();
    expect(() => postgrestQuoted("line\nbreak")).toThrow(/control/);
    expect(() => postgrestQuoted("nul\u0000")).toThrow(/control/);
    expect(() => postgrestQuoted("x".repeat(1025))).toThrow();
    expect(() => postgrestInFilter([])).toThrow();
  });
});

// ── Markdown ────────────────────────────────────────────────────────────────

/** A pipe is a column break unless an ODD number of backslashes precede it. */
const liveBreaks = (row: string) => [...row.matchAll(/(\\*)\|/g)].filter((m) => m[1].length % 2 === 0).length;

const HOSTILE = [
  "a|b",
  "a\\|b",
  "a\\\\|b",
  "trailing\\",
  "line\nbreak | x",
  "cr\r\nlf",
  "<script>alert(1)</script>",
  "[click](javascript:alert(1))",
  "![img](https://evil.example/x.png)",
  "**bold** _em_ ~~strike~~ `code`",
  "=HYPERLINK(\"https://evil.example\",\"x\")",
  "| --- | --- |",
];

describe("mdText", () => {
  it.each(HOSTILE)("keeps %j inside one cell and on one line", (value) => {
    const row = `| ${mdText(value)} |`;
    expect(liveBreaks(row)).toBe(2);
    expect(row).not.toMatch(/[\r\n]/);
  });

  it.each(HOSTILE)("leaves no unescaped markup opener in %j", (value) => {
    // Every markup character must be preceded by an odd number of backslashes.
    for (const m of mdText(value).matchAll(/(\\*)([`*_~[\]<>|])/g)) expect(m[1].length % 2).toBe(1);
  });

  it("the old pipe-only escape split a cell holding a backslash-pipe (negative control)", () => {
    const oldOutput = "a\\\\|b"; // what the pipe-only escape made of `a\|b`
    expect(mdText("a\\|b")).not.toBe(oldOutput);
    expect(liveBreaks(`| ${oldOutput} |`)).toBe(3);
  });

  it("renders absence as a dash and keeps Khmer intact", () => {
    expect(mdText(null)).toBe("—");
    expect(mdText("")).toBe("—");
    expect(mdText("/books/ថ្នាក់ទី៩-សិក្សាសង្គម")).toBe("/books/ថ្នាក់ទី៩-សិក្សាសង្គម");
  });
});

// ── Reports built from hostile evidence ─────────────────────────────────────

const BASE = "https://library.ptec.edu.kh";
const EVIL = "x|y\n| injected | row |<img src=x onerror=alert(1)>=1+1";

function hostileRecords(): AuditedRecord[] {
  const src = "/books/old";
  const dest = "/books/new";
  const probe = (prefix: string): ChainProbe => ({
    kind: "answered",
    hops: [
      { url: `${BASE}${prefix}${src}`, status: 301, location: `${prefix}${dest}`, robots: null },
      { url: `${BASE}${prefix}${dest}`, status: 200, location: null, robots: null },
    ],
    stop: "final",
    canonical: `https://evil.example/${EVIL}`,
  });
  const ev: RecordEvidence = {
    path: src,
    seededSuggestion: null,
    queue: { resolution: "redirected", suggestedPath: null, cause: "seeded", decidedByPerson: true, deciderRole: EVIL, resolvedAt: "2026-10-20" },
    redirectRow: { targetPath: dest, status: 301, decidedByPerson: true },
    alias: null,
    probes: { en: probe(""), km: probe("/km") },
    target: null,
    confirmation: { path: src, target: dest, verdict: "supported", basis: EVIL, confidence: "medium", confirmedBy: EVIL, confirmedAt: "2026-10-20" },
  };
  const ignoredPath = "/books/ignored|x";
  const ignored: RecordEvidence = {
    ...ev,
    path: ignoredPath,
    queue: { ...(ev.queue as Exclude<RecordEvidence["queue"], string>), resolution: "ignored" },
    redirectRow: null,
    probes: {
      en: { kind: "answered", hops: [{ url: `${BASE}/x`, status: 404, location: null, robots: null }], stop: "final", canonical: null },
      km: { kind: "answered", hops: [{ url: `${BASE}/km/x`, status: 404, location: null, robots: null }], stop: "final", canonical: null },
    },
    confirmation: null,
    ignoreDecision: { path: ignoredPath, reason: EVIL, decidedBy: "Claude Code (not individually reviewed by a person)", decidedAt: "2026-10-20" },
  };
  return [ev, ignored].map((e, i) => ({ id: `0171#0${i + 1}`, path: e.path, evidence: e, verdict: classifyRecord(e) }));
}

function context(records: AuditedRecord[]): ReportContext {
  return {
    header: { generatedAt: "2026-10-21T00:00:00Z", base: BASE, command: EVIL },
    recon: reconcile(records.map((r) => ({ path: r.path, suggested: null, note: EVIL })), records, true),
    records,
    meta: new Map([["/books/new", { path: "/books/new", title: EVIL, published: true, verifiedByStaff: false, createdAt: "2026-09-02", slugHistory: ["new"] }]]),
    oldSnapshots: new Map([["/books/old", 0]]),
    pageCandidates: new Map([["/books/ignored|x", [EVIL]]]),
    seedNotes: new Map(records.map((r) => [r.path, EVIL])),
    outside: [],
    limitations: [EVIL],
  };
}

describe("renderMarkdown with hostile evidence", () => {
  const md = renderMarkdown(context(hostileRecords()));
  const lines = md.split("\n");

  it("every table row has its header's column count — nothing injected a row or a column", () => {
    let columns: number | null = null;
    for (const line of lines) {
      if (!line.startsWith("|")) {
        columns = null;
        continue;
      }
      const breaks = liveBreaks(line);
      columns ??= breaks;
      expect(breaks, line).toBe(columns);
    }
  });

  it("no hostile text survives as markup", () => {
    expect(md).not.toMatch(/(^|[^\\])<img/);
    expect(md).not.toMatch(/^\| injected/m);
  });

  it("keeps fixed headings, flags the medium-confidence redirect and the intentional 404", () => {
    for (const h of ["## Reconciliation", "## Per-record audit", "## Needs librarian review", "## Intentional 404s — unresolved for URL recovery", "## Canonical diagnostics"]) {
      expect(md).toContain(h);
    }
    expect(md).toMatch(/librarian_review_pending/);
    expect(md).toMatch(/not individually reviewed by a person/);
    expect(md).toMatch(/off_site/);
  });
});

/** RFC 4180, enough to read back what toCsv writes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

describe("renderCsv with hostile evidence", () => {
  const records = hostileRecords();
  const csv = renderCsv(records, context(records).meta);
  const rows = parseCsv(csv.replace(/^﻿/, ""));

  it("one header plus one row per record, every row the header's width", () => {
    expect(rows).toHaveLength(records.length + 1);
    for (const r of rows) expect(r).toHaveLength(rows[0].length);
    expect(rows[0]).toContain("semantic_confidence");
    expect(rows[0]).toContain("review_status");
    expect(rows[0]).toContain("canonical_en");
  });

  it("starts with a BOM and uses CRLF, so Excel reads Khmer as UTF-8", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
  });

  it("no cell can be read as a formula", () => {
    for (const r of rows.slice(1)) for (const cell of r) expect(cell).not.toMatch(/^[=+\-@\t\r]/);
  });

  it("keeps the evidence itself: a guarded cell is the raw value behind one quote", () => {
    const header = rows[0];
    const ignoredRow = rows.find((r) => r[header.indexOf("id")] === "0171#02") as string[];
    expect(ignoredRow[header.indexOf("ignore_note")]).toContain(EVIL);
    expect(ignoredRow[header.indexOf("review_status")]).toBe("intentional_404");
  });
});

describe("the JSON report is the canonical evidence", () => {
  it("round-trips hostile strings exactly", () => {
    const records = hostileRecords();
    const back = JSON.parse(JSON.stringify(records)) as AuditedRecord[];
    expect(back[0].evidence.confirmation?.basis).toBe(EVIL);
    expect(back[1].evidence.ignoreDecision?.reason).toBe(EVIL);
  });
});

// ── Where reports may be written ────────────────────────────────────────────

describe("resolveReportBase / writeReportFile", () => {
  let root: string;
  let outside: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "audit-root-"));
    outside = mkdtempSync(path.join(tmpdir(), "audit-outside-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("accepts the dated default and creates its directories", () => {
    const base = resolveReportBase("reports/seo/retired-urls-audit-2026-10-21", root);
    expect(base).toBe(path.join(realpathSync(root), "reports", "seo", "retired-urls-audit-2026-10-21"));
    expect(lstatSync(path.dirname(base)).isDirectory()).toBe(true);
    writeReportFile(`${base}.md`, "ok");
    expect(readFileSync(`${base}.md`, "utf8")).toBe("ok");
    writeReportFile(`${base}.md`, "again");
    expect(readFileSync(`${base}.md`, "utf8")).toBe("again");
  });

  it.each([
    "../escape",
    "reports/../package",
    "reports/seo/../../lib/x",
    "reports",
    "reports/",
    "lib/url-redirects/audit",
    "/etc/passwd",
    "reports/.hidden",
    "reports/seo/name with space",
    "reports/se\0o/x",
    "",
  ])("refuses %j", (out) => {
    expect(() => resolveReportBase(out, root)).toThrow();
  });

  it("refuses an absolute path outside the repository", () => {
    expect(() => resolveReportBase(path.join(outside, "x"), root)).toThrow(/inside reports/);
  });

  it("refuses when reports/ itself is a symlink", () => {
    symlinkSync(outside, path.join(root, "reports"));
    expect(() => resolveReportBase("reports/seo/x", root)).toThrow(/not a plain directory/);
  });

  it("refuses a symlinked directory inside reports/", () => {
    mkdirSync(path.join(root, "reports"));
    symlinkSync(outside, path.join(root, "reports", "seo"));
    expect(() => resolveReportBase("reports/seo/x", root)).toThrow(/not a plain directory/);
  });

  it("will not write through a symlink planted at the report file", () => {
    const base = resolveReportBase("reports/seo/x", root);
    const victim = path.join(outside, "victim.txt");
    writeFileSync(victim, "untouched");
    symlinkSync(victim, `${base}.md`);
    expect(() => writeReportFile(`${base}.md`, "overwrite")).toThrow();
    expect(readFileSync(victim, "utf8")).toBe("untouched");
  });
});

// ── The collector uses all of the above ─────────────────────────────────────

describe("scripts/audit-retired-urls.ts wiring", () => {
  const src = readFileSync(path.resolve(__dirname, "../../scripts/audit-retired-urls.ts"), "utf8");

  it("writes only through writeReportFile, to a path decided before any request", () => {
    expect(src).not.toMatch(/writeFileSync|appendFileSync|createWriteStream/);
    expect(src.match(/writeReportFile\(/g)?.length).toBe(3);
    expect(src.indexOf("resolveReportBase(")).toBeGreaterThan(0);
    expect(src.indexOf("resolveReportBase(")).toBeLessThan(src.indexOf("await probeChain("));
  });

  it("builds every in-list through postgrestInFilter", () => {
    expect(src).toMatch(/postgrestInFilter\(/);
    expect(src).not.toMatch(/=in\.\(\$\{encodeURIComponent/);
    expect(src).not.toMatch(/\.replace\(\/"\/g/);
  });

  it("renders through the shared renderers and keeps no private renderer", () => {
    expect(src).toMatch(/renderMarkdown\(/);
    expect(src).toMatch(/renderCsv\(/);
    expect(src).not.toMatch(/function (toMarkdown|toCsv|cell)\b/);
  });
});
