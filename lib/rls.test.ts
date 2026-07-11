/**
 * Behavioral RLS probes — verify the live PostgREST surface enforces the
 * policies documented in docs/RLS-MATRIX.md.
 *
 * Opt-in: these tests hit a real Supabase instance, so the normal unit run
 * skips them. Run with:
 *
 *   RLS_PROBE=1 npx vitest run lib/rls.test.ts
 *
 * Environment: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (read from process.env; `npx dotenv -e .env -- …` or export them first).
 * Optionally RLS_PROBE_USER_JWT — an access token for a normal signed-in
 * reader — enables the authenticated-user assertions (see docs/RLS-MATRIX.md
 * §"Minting a probe JWT" for how to create one safely).
 *
 * Safety: every probe is read-only except the write-denial probes, which
 * POST an EMPTY object. Outcomes are either 42501 (RLS/grant denial — pass)
 * or a NOT NULL constraint violation (23502 — fail, flags a policy gap);
 * neither can persist a row. Safe against production.
 */
import { describe, it, expect } from "vitest";

const RUN = !!process.env.RLS_PROBE;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const USER_JWT = process.env.RLS_PROBE_USER_JWT ?? "";

function headers(token: string) {
  return {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function rowsVisible(table: string, token: string): Promise<number> {
  const res = await fetch(`${URL_}/rest/v1/${table}?limit=1`, {
    headers: { ...headers(token), Prefer: "count=exact" },
  });
  if (res.status === 401 || res.status === 403) return 0; // grant-level denial
  const range = res.headers.get("content-range") ?? "*/0";
  return Number(range.split("/")[1] ?? 0);
}

async function insertDenied(table: string, token: string): Promise<boolean> {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: headers(token),
    body: "{}",
  });
  if (res.ok) return false; // would be a real policy gap
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  // 42501 = RLS / privilege denial. Anything else (e.g. 23502 NOT NULL)
  // means the request was *allowed* past authorization and only failed on
  // data constraints — that is a gap, so report it as not-denied.
  return body.code === "42501";
}

// Tables that must expose ZERO rows to anonymous clients.
const ANON_ZERO_TABLES = [
  "profiles",
  "contact_messages",
  "search_queries",
  "push_subscriptions",
  "ai_usage",
  "admin_audit_log",
  "book_notes",
  "book_annotations",
  "reading_progress",
  "saved_books",
  "download_logs",
  "view_logs",
  "book_requests",
  "notifications",
  "search_result_clicks",
  "team_members", // 0071 closed anon reads; served via service role
  "role_permissions",
];

// Tables anonymous users must NOT be able to write to (content tables).
const ANON_WRITE_DENIED = [
  "books",
  "posts",
  "research_reports",
  "publications",
  "reviews",
  "profiles",
  "categories",
  "departments",
];

describe.skipIf(!RUN)("RLS behavioral probes (live PostgREST)", () => {
  it("has probe configuration", () => {
    expect(URL_, "NEXT_PUBLIC_SUPABASE_URL missing").toBeTruthy();
    expect(ANON, "NEXT_PUBLIC_SUPABASE_ANON_KEY missing").toBeTruthy();
  });

  describe("anonymous", () => {
    it.each(ANON_ZERO_TABLES)("%s exposes zero rows", async (table) => {
      expect(await rowsVisible(table, ANON)).toBe(0);
    });

    it("published content is readable (positive control)", async () => {
      // Guards against the suite "passing" because the API is down.
      expect(await rowsVisible("books", ANON)).toBeGreaterThan(0);
      expect(await rowsVisible("categories", ANON)).toBeGreaterThan(0);
    });

    it("rate_limit is denied at the grant level", async () => {
      const res = await fetch(`${URL_}/rest/v1/rate_limit?limit=1`, {
        headers: headers(ANON),
      });
      expect([401, 403]).toContain(res.status);
    });

    it.each(ANON_WRITE_DENIED)("cannot insert into %s", async (table) => {
      expect(await insertDenied(table, ANON)).toBe(true);
    });
  });

  describe.skipIf(!USER_JWT)("authenticated reader", () => {
    it("still cannot read other users' private tables beyond own rows", async () => {
      // A fresh probe user owns no rows anywhere, so visible-count must be 0.
      for (const table of [
        "contact_messages",
        "admin_audit_log",
        "search_queries",
        "role_permissions",
      ]) {
        expect(await rowsVisible(table, USER_JWT), table).toBe(0);
      }
    });

    it("cannot write to content tables", async () => {
      for (const table of ["books", "posts", "research_reports", "categories"]) {
        expect(await insertDenied(table, USER_JWT), table).toBe(true);
      }
    });

    it("cannot self-elevate via profiles.role", async () => {
      // Column grants limit authenticated UPDATE to full_name/avatar_url;
      // PATCHing role must be rejected (42501) — never applied.
      const res = await fetch(`${URL_}/rest/v1/profiles?id=eq.self`, {
        method: "PATCH",
        headers: headers(USER_JWT),
        body: JSON.stringify({ role: "super_admin" }),
      });
      expect(res.ok).toBe(false);
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      // 42501 privilege denial (column grant) — the filter never even runs.
      expect(body.code).toBe("42501");
    });
  });
});
