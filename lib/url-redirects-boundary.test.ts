// URL permanence (migration 0170, SEO audit 2026-10 WI-1) — the rules that
// must keep holding, read from the source rather than from a running stack.
//
//   * both tables are RLS-on and revoked; the edge reads a COLUMN grant on the
//     decision (old_path, target_path, status) and never `reason`, which can
//     name a rights removal;
//   * only the service role may call upsert_url_redirect;
//   * every slug change, every return to life and every retirement of a book,
//     thesis or subject is captured by a trigger — and none is a column-list
//     `update of …` trigger, which cannot see the BEFORE trigger that mirrors
//     is_published from status (C3);
//   * middleware consults the gate in one place, only after a slug gate has
//     said "not found", and only while URL_REDIRECTS is not "off".
//
// Each rule is a pure function over source text, so the negative controls
// below can feed it a broken copy and watch it fail.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { goneHtml, goneResponse } from "@/lib/gone-response";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const MIGRATION = "supabase/migrations/0170_url_redirects.sql";

const stripSqlComments = (sql: string) => sql.replace(/--.*$/gm, "");
const stripTsComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const squash = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

/** Every rule 0170 must satisfy. Returns the violations; empty means clean. */
export function migrationViolations(rawSql: string): string[] {
  const sql = squash(stripSqlComments(rawSql));
  const out: string[] = [];

  for (const table of ["url_redirects", "retired_url_queue"]) {
    if (!sql.includes(`alter table public.${table} enable row level security`)) {
      out.push(`${table}: RLS not enabled`);
    }
    if (!sql.includes(`revoke all on table public.${table} from public, anon, authenticated`)) {
      out.push(`${table}: not revoked from public, anon, authenticated`);
    }
  }

  const grants = sql.match(/grant [^;]*;/g) ?? [];
  for (const grant of grants) {
    if (grant.includes("retired_url_queue")) out.push(`queue granted: ${grant}`);
    if (!grant.includes("url_redirects")) continue;
    if (grant.includes("reason")) out.push(`reason granted: ${grant}`);
    if (/grant (select|all)( privileges)? on/.test(grant)) out.push(`whole-table grant: ${grant}`);
    if (/\b(insert|update|delete)\b/.test(grant)) out.push(`write grant: ${grant}`);
    if (/to [^;]*\b(anon|authenticated|public)\b/.test(grant) && grant.startsWith("grant execute")) {
      out.push(`rpc granted to a public role: ${grant}`);
    }
  }
  if (!grants.some((g) => /grant select \(old_path, target_path, status\) on public\.url_redirects to anon, authenticated/.test(g))) {
    out.push("the edge's column grant on (old_path, target_path, status) is missing");
  }
  if (
    !sql.includes(
      "revoke all on function public.upsert_url_redirect(text, text, smallint, text, uuid) from public, anon, authenticated",
    )
  ) {
    out.push("upsert_url_redirect is not revoked from public, anon, authenticated");
  }

  if (/\bupdate of\b/.test(sql)) out.push("a column-list `update of` trigger (C3)");

  const triggers = sql.match(/create trigger [^;]*;/g) ?? [];
  const has = (table: string, fn: string, arg?: string) =>
    triggers.some(
      (t) => t.includes(` on public.${table} `) && t.includes(`execute function public.${fn}(${arg ?? ""}`),
    );
  const expected: [string, string, string][] = [
    ["books", "capture_slug_change", "'/books'"],
    ["books", "clear_url_retirement", "'/books'"],
    ["books", "capture_retired_url", "'/books', 'book', 'deleted'"],
    ["books", "capture_retired_url", "'/books', 'book', 'unpublished'"],
    ["research_reports", "capture_slug_change", "'/theses'"],
    ["research_reports", "clear_url_retirement", "'/theses'"],
    ["research_reports", "capture_retired_url", "'/theses', 'thesis', 'deleted'"],
    ["research_reports", "capture_retired_url", "'/theses', 'thesis', 'unpublished'"],
    ["categories", "capture_slug_change", "'/subjects'"],
    ["categories", "clear_url_retirement", "'/subjects'"],
    ["categories", "capture_retired_url", "'/subjects', 'subject', 'deleted'"],
    ["books", "sync_book_alias_retirements", ""],
    ["book_slug_redirects", "resolve_book_alias_retirement", ""],
  ];
  for (const [table, fn, arg] of expected) {
    if (!has(table, fn, arg)) out.push(`missing trigger: ${table} → ${fn}(${arg})`);
  }
  return out;
}

/** Middleware rules. Returns the violations; empty means clean. */
export function middlewareViolations(rawSrc: string): string[] {
  const src = stripTsComments(rawSrc);
  const out: string[] = [];
  const start = src.indexOf("const notFoundOrRedirect = async");
  if (start < 0) return ["no notFoundOrRedirect helper"];
  // The helper's body: from its opening brace to the brace that closes it.
  const open = src.indexOf("{", src.indexOf("=>", start));
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    if (src[end] === "{") depth++;
    if (src[end] === "}" && --depth === 0) break;
  }
  const helper = src.slice(start, end + 1);
  const outside = src.slice(0, start) + src.slice(end + 1);

  const calls = src.match(/gateUrlRedirect\(/g) ?? [];
  if (calls.length !== 1) out.push(`gateUrlRedirect is called ${calls.length} times, expected once`);
  if (!helper.includes("gateUrlRedirect(")) out.push("gateUrlRedirect is called outside the not-found helper");
  const guard = helper.indexOf("if (urlRedirectsEnabled())");
  if (guard < 0 || guard > helper.indexOf("gateUrlRedirect(")) {
    out.push("gateUrlRedirect is not behind the URL_REDIRECTS switch");
  }
  if (/NextResponse\.rewrite\(\s*new URL\(\s*NOT_FOUND_PATH/.test(outside)) {
    out.push("a not-found rewrite bypasses notFoundOrRedirect");
  }
  if (!/goneResponse\(/.test(helper)) out.push("the helper never answers 410");
  return out;
}

describe("0170 — tables, grants, the one writer, triggers", () => {
  const sql = read(MIGRATION);

  it("satisfies every rule", () => {
    expect(migrationViolations(sql)).toEqual([]);
  });

  it("starts with a lock timeout and documents its rollback", () => {
    expect(sql).toMatch(/^set local lock_timeout = '10s';/m);
    expect(sql).toMatch(/-- Rollback/);
  });

  describe("negative controls", () => {
    it("catches a grant of `reason` to the edge", () => {
      const broken = sql.replace(
        "grant select (old_path, target_path, status)",
        "grant select (old_path, target_path, status, reason)",
      );
      expect(broken).not.toBe(sql);
      expect(migrationViolations(broken).join("\n")).toMatch(/reason granted/);
    });

    it("catches a whole-table grant", () => {
      const broken = sql + "\ngrant select on public.url_redirects to anon;\n";
      expect(migrationViolations(broken).join("\n")).toMatch(/whole-table grant/);
    });

    it("catches a column-list trigger on is_published (C3)", () => {
      const broken = sql.replace(
        "create trigger books_url_retire_unpublish after update on public.books",
        "create trigger books_url_retire_unpublish after update of is_published on public.books",
      );
      expect(broken).not.toBe(sql);
      expect(migrationViolations(broken).join("\n")).toMatch(/update of/);
    });

    it("catches a missing RLS statement", () => {
      const broken = sql.replace("alter table public.retired_url_queue enable row level security;", "");
      expect(migrationViolations(broken).join("\n")).toMatch(/retired_url_queue: RLS not enabled/);
    });

    it("catches the RPC left callable by anon", () => {
      const broken = sql.replace(
        "revoke all on function public.upsert_url_redirect(text, text, smallint, text, uuid)\n  from public, anon, authenticated;",
        "",
      );
      expect(broken).not.toBe(sql);
      expect(migrationViolations(broken).join("\n")).toMatch(/upsert_url_redirect is not revoked/);
    });

    it("catches a dropped retirement trigger", () => {
      const broken = sql.replace(
        "execute function public.capture_retired_url('/theses', 'thesis', 'unpublished');",
        "execute function public.capture_retired_url('/theses', 'thesis', 'deleted');",
      );
      expect(migrationViolations(broken).join("\n")).toMatch(/research_reports → capture_retired_url\('\/theses', 'thesis', 'unpublished'\)/);
    });
  });
});

describe("middleware — one gate, after the slug gates, behind the switch", () => {
  const src = read("middleware.ts");

  it("satisfies every rule", () => {
    expect(middlewareViolations(src)).toEqual([]);
  });

  describe("negative controls", () => {
    it("catches a not-found branch that bypasses the helper", () => {
      const broken = src.replace(
        'if (verdict?.kind === "not-found") return notFoundOrRedirect();',
        'if (verdict?.kind === "not-found") return applySecurity(NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url)));',
      );
      expect(broken).not.toBe(src);
      expect(middlewareViolations(broken).join("\n")).toMatch(/bypasses notFoundOrRedirect/);
    });

    it("catches the gate taken out from behind the switch", () => {
      const broken = src.replace("if (urlRedirectsEnabled())", "if (true)");
      expect(middlewareViolations(broken).join("\n")).toMatch(/not behind the URL_REDIRECTS switch/);
    });

    it("catches a second call site", () => {
      const broken = src.replace(
        "const isKm =",
        'await gateUrlRedirect(pathname, { supabaseUrl: "", anonKey: "" });\n  const isKm =',
      );
      expect(middlewareViolations(broken).join("\n")).toMatch(/called 2 times/);
    });
  });
});

describe("the 410 answer", () => {
  it("is a 410, noindex, short-cached HTML", () => {
    const res = goneResponse("en");
    expect(res.status).toBe(410);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("speaks the reader's language first, offers both, and links the right books listing", () => {
    const en = goneHtml("en");
    const km = goneHtml("km");
    expect(en).toMatch(/<html lang="en">/);
    expect(km).toMatch(/<html lang="km">/);
    expect(en.indexOf('lang="en"><h1>')).toBeGreaterThan(-1);
    expect(km.indexOf('lang="km"><h1>')).toBeGreaterThan(-1);
    expect(en).toContain('href="/km/books"');
    expect(km).toContain('href="/books"');
    expect(en).toContain('<meta name="robots" content="noindex">');
  });

  it("never states a reason", () => {
    for (const html of [goneHtml("en"), goneHtml("km")]) {
      expect(html).not.toMatch(/rights|copyright|withdrawn|licen[cs]e/i);
    }
  });
});
