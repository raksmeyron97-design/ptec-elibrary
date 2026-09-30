import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Every surface that decides whether a reader may READ or DOWNLOAD a thesis
// asks lib/theses/access.ts — the projection of the one download engine.
//
// This exists because the record page once decided for itself: it drew a
// solid "Preview PDF" for any record with a `file_url`, and the reader it
// opened asked /api/theses/[id]/file for the bytes, which answered 403 for
// every Top-10 and admin-blocked thesis. The unit tests in access.test.ts
// prove the projection agrees with the routes; this file proves the surfaces
// actually use it — and that the shared-cached page keeps the viewer's half
// of the decision in the browser, and the storage URL out of it.

const ROOT = path.join(__dirname, "..", "..");

/** Source with comments stripped, so prose that NAMES a rule cannot satisfy
 *  or trip the check that enforces it. */
function code(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const FILE_ROUTE = "app/api/theses/[id]/file/route.ts";
const STATUS_ROUTE = "app/api/theses/[id]/download-status/route.ts";
const PAGE = "app/[locale]/(public)/theses/[slug]/page.tsx";
const RECORD = "lib/theses/record.ts";
const RECORD_DIR = "components/ui/theses/record";
const HOOK = `${RECORD_DIR}/useThesisAccess.ts`;
const PANEL = `${RECORD_DIR}/AccessPanel.tsx`;
const DOCK = `${RECORD_DIR}/ActionDock.tsx`;
const FULL_TEXT = `${RECORD_DIR}/FullTextPreview.tsx`;
const READ_BUTTON = `${RECORD_DIR}/ReadOnlineButton.tsx`;
const VIEW = `${RECORD_DIR}/ThesisRecordView.tsx`;

function sourcesUnder(dir: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name))
    .map((e) => path.relative(ROOT, path.join(e.parentPath ?? dir, e.name)).replace(/\\/g, "/"));
}

describe("thesis access has one decision-maker", () => {
  it.each([FILE_ROUTE, STATUS_ROUTE, RECORD])("%s resolves access through resolveThesisAccess()", (rel) => {
    expect(code(rel)).toMatch(/\bresolveThesisAccess\s*\(/);
  });

  it("the file route refuses on the projection's states, not on its own reading of the decision", () => {
    const src = code(FILE_ROUTE);
    expect(src).toMatch(/access\.state\s*===\s*["']unavailable["']/);
    expect(src).toMatch(/access\.state\s*===\s*["']protected["']/);
    expect(src).not.toMatch(/decision\.effectivePolicy\s*===\s*["']blocked["']/);
  });

  it("the status route tells the client what it may READ, not only what it may download", () => {
    const src = code(STATUS_ROUTE);
    expect(src).toMatch(/canRead\s*:\s*access\.canRead/);
    expect(src).toMatch(/state\s*:\s*access\.state/);
  });

  it("the status route decides the staff Edit link by the registry's own edit policy", () => {
    const src = code(STATUS_ROUTE);
    expect(src).toMatch(/canAccessRoute\([^)]*["']theses\.edit["']\)/);
  });

  it("the record builder renders the ANONYMOUS reader's state, never a session's", () => {
    expect(code(RECORD)).toMatch(/resolveThesisAccess\(\{[^}]*authenticated:\s*false/);
  });
});

describe("the shared-cached page keeps the viewer's half in the browser", () => {
  it("the page reads no session, and every read control is handed the record-level access", () => {
    expect(code(PAGE)).not.toMatch(/auth\s*\.\s*getUser\s*\(|\bcookies\s*\(|\bcreateClient\s*\(/);
    const view = code(VIEW);
    for (const control of ["AccessPanel", "FullTextPreview", "ActionDock", "ThesisEditLink"]) {
      expect(view, control).toMatch(new RegExp(`<${control}[\\s\\S]*?recordAccess=\\{record\\.access\\}`));
    }
  });

  it("the access panel, the full-text slot and the dock all ask the one hook", () => {
    for (const rel of [PANEL, FULL_TEXT, DOCK]) {
      expect(code(rel), rel).toMatch(/useThesisAccess\(/);
    }
    // And only the hook asks the status route.
    const askers = sourcesUnder(RECORD_DIR).filter((rel) => /download-status/.test(code(rel)));
    expect(askers).toEqual([HOOK]);
  });

  it("only ReadOnlineButton opens the reader, and every caller draws it behind canRead", () => {
    const openers = [...sourcesUnder("components/ui/theses"), ...sourcesUnder("app/[locale]/(public)/theses")].filter(
      (rel) => /openThesisReader\s*\(/.test(code(rel)),
    );
    expect(openers).toEqual([READ_BUTTON]);
    for (const rel of [PANEL, DOCK]) {
      const src = code(rel);
      const uses = src.match(/<ReadOnlineButton\b/g)?.length ?? 0;
      const gated = src.match(/canRead\s*&&\s*<ReadOnlineButton\b/g)?.length ?? 0;
      expect(uses, rel).toBeGreaterThan(0);
      expect(gated, rel).toBe(uses);
    }
  });

  it("the in-page reader mounts only for a reader the file route will serve", () => {
    const src = code(FULL_TEXT);
    expect(src).toMatch(/if\s*\(\s*!canRead\s*\)\s*return/);
    expect(src).toMatch(/const canRead\s*=\s*access\.canRead/);
    expect(src).not.toMatch(/\bisLoggedIn\b|\bhasFile\b/);
  });

  it("an admin edit reaches the cached page: its row read carries the tag every thesis mutation revalidates", () => {
    const loader = code("lib/theses/record.server.ts");
    expect(loader).toMatch(/unstable_cache\(/);
    expect(loader).toMatch(/cachedRow\("slug", slug, \[TAGS\.theses, TAGS\.thesis\(slug\)\]\)/);
    // A failed read throws rather than caching "not found" for an hour.
    expect(loader).toMatch(/if \(error\) throw/);
    expect(code("lib/cache/revalidate.ts")).toMatch(
      /export function revalidateThesis[\s\S]*?revalidateTag\(TAGS\.theses/,
    );
  });

  it("no record component is handed the database row, whose file_url is a storage address", () => {
    const src = code(PAGE);
    expect(src).not.toMatch(/report=\{/);
    for (const rel of sourcesUnder(RECORD_DIR)) {
      expect(code(rel), rel).not.toMatch(/file_url|ResearchReport/);
    }
  });
});
