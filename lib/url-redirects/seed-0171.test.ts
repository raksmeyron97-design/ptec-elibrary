// 0171 seeds the 43 dead URLs into the retired-URL queue (SEO audit 2026-10,
// WI-1). It must ASK, never answer: no row of url_redirects is written, every
// row is gated on the corpus it lands in, and a decided row is never reset.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SQL = readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0171_seed_retired_urls.sql"),
  "utf8",
);

const STORED_SHAPE = /^\/[a-z]+(\/[^/]+)+$/;

/** The seed tuples, parsed from the VALUES list. */
function seedRows(sql: string): { path: string; suggested: string | null }[] {
  const body = sql.slice(sql.indexOf("values"), sql.indexOf("),\njudged"));
  return [...body.matchAll(/\(\s*'([^']+)',\s*(null|'([^']+)'),\s*'/g)].map((m) => ({
    path: m[1],
    suggested: m[3] ?? null,
  }));
}

export function seedViolations(sql: string): string[] {
  const code = sql.replace(/--.*$/gm, "").toLowerCase();
  const out: string[] = [];
  if (/insert\s+into\s+public\.url_redirects|upsert_url_redirect/.test(code)) out.push("writes a redirect");
  if (!/on conflict \(path\) do nothing/.test(code)) out.push("not idempotent (a decided row could be reset)");
  if (!/live_targets >= 10/.test(code)) out.push("no production-corpus gate");
  if (!/where not exists \(select 1 from public\.books b where '\/books\/' \|\| b\.slug = j\.path\)/.test(code)) {
    out.push("a live path is not skipped");
  }
  if (!/b\.is_published and '\/books\/' \|\| b\.slug = s\.suggested_path/.test(code)) {
    out.push("a book suggestion is not checked live");
  }
  if (!/r\.is_published and '\/theses\/' \|\| r\.slug = s\.suggested_path/.test(code)) {
    out.push("a thesis suggestion is not checked live");
  }
  return out;
}

describe("0171 — the 43 dead URLs, as questions", () => {
  const rows = seedRows(SQL);

  it("holds exactly the 43 audited paths, each once, all books", () => {
    expect(rows).toHaveLength(43);
    expect(new Set(rows.map((r) => r.path)).size).toBe(43);
    expect(rows.every((r) => r.path.startsWith("/books/"))).toBe(true);
  });

  it("suggests 16 distinct successors, none of them the dead path itself", () => {
    const suggested = rows.map((r) => r.suggested).filter((s): s is string => s !== null);
    expect(new Set(suggested).size).toBe(16);
    expect(rows.filter((r) => r.suggested === r.path)).toEqual([]);
  });

  it("every path fits the shape url_redirects will store", () => {
    for (const r of rows) {
      expect(r.path).toMatch(STORED_SHAPE);
      if (r.suggested) expect(r.suggested).toMatch(STORED_SHAPE);
    }
  });

  it("satisfies every rule", () => {
    expect(seedViolations(SQL)).toEqual([]);
  });

  describe("negative controls", () => {
    it("catches a seed that writes a redirect", () => {
      const broken = `${SQL}\ninsert into public.url_redirects (old_path, target_path, status, reason) values ('/books/a', '/books/b', 301, 'manual');`;
      expect(seedViolations(broken)).toContain("writes a redirect");
    });

    it("catches a seed that resets decided rows", () => {
      const broken = SQL.replace("on conflict (path) do nothing", "on conflict (path) do update set resolution = 'pending'");
      expect(broken).not.toBe(SQL);
      expect(seedViolations(broken)).toContain("not idempotent (a decided row could be reset)");
    });

    it("catches a seed without the corpus gate", () => {
      const broken = SQL.replace("c.live_targets >= 10", "true");
      expect(broken).not.toBe(SQL);
      expect(seedViolations(broken)).toContain("no production-corpus gate");
    });
  });
});
