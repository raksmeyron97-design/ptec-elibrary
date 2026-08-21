import { test, expect } from "@playwright/test";

/**
 * Detail-route HTTP status correctness.
 *
 * Every route under app/[locale]/(public) streams its `loading` boundary
 * first, so an unknown detail slug used to return HTTP 200 with not-found
 * content (a soft 404) for theses, publications and catalogs — search engines
 * then index the "not found" page as a live 200. Middleware now gates these
 * slugs at the edge (lib/resource-slug-gate.ts, mirroring the books gate) and
 * rewrites unknown ones to a real 404. Books were already gated.
 *
 * Legacy /theses/<uuid> URLs additionally 301 to the canonical slug when the
 * id maps to a published thesis; unknown ids 404.
 */

const PROD = "https://library.ptec.edu.kh";
const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";
const unknown = () => `no-such-slug-${Math.random().toString(36).slice(2)}`;

test.describe("detail routes return real 404s for unknown slugs", () => {
  for (const segment of ["books", "theses", "publications", "catalogs"]) {
    test(`/${segment}/<unknown> → 404`, async ({ request }) => {
      const res = await request.get(`/${segment}/${unknown()}`, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });

    test(`/km/${segment}/<unknown> → 404`, async ({ request }) => {
      const res = await request.get(`/km/${segment}/${unknown()}`, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  }
});

test.describe("legacy thesis id URLs", () => {
  test("unknown UUID id → 404 (no 500, no redirect loop)", async ({ request }) => {
    const res = await request.get(`/theses/${UNKNOWN_UUID}`, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test("a published thesis's UUID 301s to its canonical slug", async ({ request }) => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    test.skip(!base || !anon, "Supabase env not available to discover a fixture thesis");

    const rest = await request.get(
      `${base}/rest/v1/research_reports?select=id,slug&is_published=eq.true&slug=not.is.null&limit=1`,
      { headers: { apikey: anon!, Authorization: `Bearer ${anon}` } },
    );
    test.skip(!rest.ok(), "Could not query research_reports for a fixture");
    const rows = (await rest.json()) as { id: string; slug: string }[];
    test.skip(rows.length === 0, "No published thesis with a slug in this database");

    const { id, slug } = rows[0];
    const res = await request.get(`/theses/${id}`, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(new URL(res.headers()["location"], PROD).pathname).toBe(`/theses/${slug}`);
  });
});
