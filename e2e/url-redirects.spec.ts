import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * URL permanence (migration 0170, SEO audit 2026-10 WI-1).
 *
 * Two halves:
 *   * the EDGE: seeded url_redirects rows (supabase/seed.sql) answer a one-hop
 *     301 with the locale kept, a 410 with noindex, and an unknown slug still
 *     a 404;
 *   * the TRIGGERS, driven through the local stack's REST API with the service
 *     key: a category rename leaves a 301 and renaming it BACK succeeds (C2),
 *     a book leaving the site is queued and coming back clears it, chains
 *     collapse, and anon can read the decision but never `reason`.
 *
 * The trigger half writes to the database, so it refuses to run against
 * anything but a local stack.
 */

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPABASE.replace(/\/$/, ""));

const KHMER_OLD = "/books/វិធីសាស្ត្របង្រៀនភាសាខ្មែរ-ចាស់";
const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");
const pathOf = (location: string) => decodeURIComponent(new URL(location, "http://x").pathname);

test.describe("the edge answers a retired URL", () => {
  test("a 301 lands on a live page in one hop", async ({ request }) => {
    const res = await request.get("/books/foundations-of-education-first-printing", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    const target = pathOf(res.headers()["location"]);
    expect(target).toBe("/books/foundations-of-education");
    const hop = await request.get(target, { maxRedirects: 0 });
    expect(hop.status()).toBe(200);
  });

  test("the locale and the query string survive the redirect", async ({ request }) => {
    const res = await request.get("/km/books/foundations-of-education-first-printing?ref=e2e", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    const location = new URL(res.headers()["location"], "http://x");
    expect(decodeURIComponent(location.pathname)).toBe("/km/books/foundations-of-education");
    expect(location.search).toBe("?ref=e2e");
  });

  test("a Khmer old slug redirects, encoded once", async ({ request }) => {
    const res = await request.get(encodePath(KHMER_OLD), { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["location"]).not.toContain("%25");
    expect(pathOf(res.headers()["location"])).toBe("/books/khmer-teaching-methods");
  });

  test("a deliberate removal is a 410 with noindex, in both languages", async ({ request }) => {
    for (const prefix of ["", "/km"]) {
      const res = await request.get(`${prefix}/books/e2e-withdrawn-title`, { maxRedirects: 0 });
      expect(res.status()).toBe(410);
      expect(res.headers()["x-robots-tag"]).toMatch(/noindex/);
      const html = await res.text();
      expect(html).toContain(prefix ? 'lang="km"' : 'lang="en"');
      expect(html).not.toMatch(/withdrawn|rights/i);
    }
  });

  test("an unknown slug is still a 404", async ({ request }) => {
    const res = await request.get("/books/no-such-book-anywhere-e2e", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test("a live book is untouched", async ({ request }) => {
    const res = await request.get("/books/foundations-of-education", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });
});

test.describe("the triggers capture every way a URL dies", () => {
  test.skip(!LOCAL || !SERVICE || !ANON, "needs the LOCAL Supabase stack and its service key");

  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const rest = (path: string) => `${SUPABASE}/rest/v1/${path}`;

  async function redirectRow(request: APIRequestContext, oldPath: string) {
    const res = await request.get(rest(`url_redirects?old_path=eq.${encodeURIComponent(oldPath)}&select=*`), { headers });
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { target_path: string | null; status: number }[])[0] ?? null;
  }

  async function queueRow(request: APIRequestContext, path: string) {
    const res = await request.get(rest(`retired_url_queue?path=eq.${encodeURIComponent(path)}&select=*`), { headers });
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { cause: string; resolution: string; note: string | null }[])[0] ?? null;
  }

  test("a category rename leaves a 301, and renaming it back succeeds (C2)", async ({ request }) => {
    const suffix = Date.now().toString(36);
    const a = `e2e-subject-a-${suffix}`;
    const b = `e2e-subject-b-${suffix}`;
    const created = await request.post(rest("categories"), { headers, data: { name: `E2E ${suffix}`, slug: a } });
    expect(created.ok()).toBe(true);
    const [{ id }] = (await created.json()) as { id: string }[];
    try {
      const toB = await request.patch(rest(`categories?id=eq.${id}`), { headers, data: { slug: b } });
      expect(toB.ok()).toBe(true);
      expect(await redirectRow(request, `/subjects/${a}`)).toMatchObject({ target_path: `/subjects/${b}`, status: 301 });

      const back = await request.patch(rest(`categories?id=eq.${id}`), { headers, data: { slug: a } });
      expect(back.ok(), await back.text()).toBe(true);
      expect(await redirectRow(request, `/subjects/${a}`)).toBeNull();
      expect(await redirectRow(request, `/subjects/${b}`)).toMatchObject({ target_path: `/subjects/${a}`, status: 301 });
    } finally {
      await request.delete(rest(`categories?id=eq.${id}`), { headers });
      for (const p of [`/subjects/${a}`, `/subjects/${b}`]) {
        await request.delete(rest(`url_redirects?old_path=eq.${encodeURIComponent(p)}`), { headers });
        await request.delete(rest(`retired_url_queue?path=eq.${encodeURIComponent(p)}`), { headers });
      }
    }
  });

  test("a book that leaves the site is queued, with its aliases; coming back clears them", async ({ request }) => {
    const suffix = Date.now().toString(36);
    const slug = `e2e-retiring-book-${suffix}`;
    const alias = `e2e-retiring-alias-${suffix}`;
    const created = await request.post(rest("books"), {
      headers,
      data: { title: `E2E retiring ${suffix}`, slug, status: "published", is_published: true, language: "English" },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const [{ id }] = (await created.json()) as { id: string }[];
    try {
      const aliasRes = await request.post(rest("book_slug_redirects"), { headers, data: { old_slug: alias, book_id: id } });
      expect(aliasRes.ok(), await aliasRes.text()).toBe(true);

      await request.patch(rest(`books?id=eq.${id}`), { headers, data: { status: "archived" } });
      expect(await queueRow(request, `/books/${slug}`)).toMatchObject({ cause: "unpublished", resolution: "pending" });
      expect(await queueRow(request, `/books/${alias}`)).toMatchObject({ cause: "unpublished", note: `alias of /books/${slug}` });

      await request.patch(rest(`books?id=eq.${id}`), { headers, data: { status: "published" } });
      expect(await queueRow(request, `/books/${slug}`)).toBeNull();
      expect(await queueRow(request, `/books/${alias}`)).toBeNull();

      const del = await request.delete(rest(`books?id=eq.${id}`), { headers });
      expect(del.ok(), await del.text()).toBe(true);
      expect(await queueRow(request, `/books/${slug}`)).toMatchObject({ cause: "deleted" });
      expect(await queueRow(request, `/books/${alias}`)).toMatchObject({ cause: "deleted" });
    } finally {
      await request.delete(rest(`books?id=eq.${id}`), { headers });
      for (const p of [`/books/${slug}`, `/books/${alias}`]) {
        await request.delete(rest(`retired_url_queue?path=eq.${encodeURIComponent(p)}`), { headers });
      }
    }
  });

  test("a chain X → A, A → B collapses to X → B", async ({ request }) => {
    const suffix = Date.now().toString(36);
    const [x, a, b] = ["x", "a", "b"].map((k) => `/books/e2e-chain-${k}-${suffix}`);
    const rpc = (p_old: string, p_target: string) =>
      request.post(rest("rpc/upsert_url_redirect"), {
        headers,
        data: { p_old, p_target, p_status: 301, p_reason: "manual", p_actor: null },
      });
    try {
      expect((await rpc(x, a)).ok()).toBe(true);
      expect((await rpc(a, b)).ok()).toBe(true);
      expect(await redirectRow(request, x)).toMatchObject({ target_path: b });
      const loop = await rpc(b, x);
      expect(loop.ok()).toBe(false);
    } finally {
      for (const p of [x, a, b]) await request.delete(rest(`url_redirects?old_path=eq.${encodeURIComponent(p)}`), { headers });
    }
  });

  test("anon reads the decision and nothing else", async ({ request }) => {
    const anon = { apikey: ANON, Authorization: `Bearer ${ANON}` };
    const decision = await request.get(rest("url_redirects?select=old_path,target_path,status&limit=1"), { headers: anon });
    expect(decision.ok()).toBe(true);
    const reason = await request.get(rest("url_redirects?select=reason&limit=1"), { headers: anon });
    expect(reason.ok()).toBe(false);
    const queue = await request.get(rest("retired_url_queue?select=path&limit=1"), { headers: anon });
    expect(queue.ok()).toBe(false);
    const call = await request.post(rest("rpc/upsert_url_redirect"), {
      headers: { ...anon, "Content-Type": "application/json" },
      data: { p_old: "/books/e2e-anon", p_target: "/books/e2e-anon-b", p_status: 301, p_reason: "manual" },
    });
    expect(call.ok()).toBe(false);
  });
});
