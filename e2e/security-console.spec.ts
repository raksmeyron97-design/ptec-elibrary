import { test, expect } from '@playwright/test';

/**
 * The security console and the security APIs, from outside.
 *
 * ── What this covers, and why it is shaped this way ─────────────────────────
 * This suite has no authenticated-admin fixture (nothing in e2e/ does — every
 * other spec is public-facing), so it deliberately does NOT try to exercise the
 * console's own UI. Building half an auth fixture to click one button would be
 * worse than not having one.
 *
 * What it CAN test without any session is the property that actually matters
 * to an outsider: **none of this is reachable by one.** An incident console
 * lists what is attacking the library, the accounts involved, and which
 * controls fired — a browsable version of that is a gift to an attacker. So
 * every route is asserted to refuse an anonymous visitor, and every security
 * API is asserted to refuse a request without the right bearer secret.
 *
 * Authenticated coverage of the console's behaviour lives in
 * `lib/security/incidents.integration.test.ts` (whole pipeline, in-memory
 * database) and `lib/security/incidents.probe.test.ts` (same, real Postgres).
 */

const CONSOLE_ROUTES = [
  '/admin/security',
  '/admin/security/incidents',
  '/admin/security/incidents/SEC-20260831-001',
  '/admin/security/events',
];

test.describe('security console is not reachable without a session', () => {
  for (const route of CONSOLE_ROUTES) {
    test(`${route} sends an anonymous visitor to the admin login`, async ({ page }) => {
      const response = await page.goto(route);

      // The (protected) admin layout redirects to /admin/login. Assert on the
      // landing URL rather than the status: a redirect chain can end in a 200.
      await expect(page).toHaveURL(/\/admin\/login/);
      expect(response?.status()).toBeLessThan(500);

      // And nothing from the console leaked into whatever was rendered.
      const body = await page.content();
      expect(body).not.toContain('Detection reason');
      expect(body).not.toContain('SEC-');
    });
  }

  test('the console is never indexable', async ({ request }) => {
    const response = await request.get('/admin/security', { maxRedirects: 0 });
    const robots = response.headers()['x-robots-tag'] ?? '';
    expect(robots).toContain('noindex');
  });
});

test.describe('security APIs refuse unauthenticated callers', () => {
  // The route answers 401 when CRON_SECRET is configured and 500 ("cron not
  // configured") when it is not — the same shape as the existing
  // publish-scheduled and cleanup routes. CI runs the e2e job WITHOUT that
  // secret, so pinning 401 made this pass locally and fail there.
  //
  // What matters is invariant across both: the pass is REFUSED, and the
  // refusal gives an unauthenticated caller nothing.
  const REFUSED = [401, 500];

  test('the detection pass refuses an unauthenticated caller', async ({ request }) => {
    const response = await request.get('/api/cron/security-scan');
    expect(REFUSED, `unexpected status ${response.status()}`).toContain(response.status());

    // The refusal must not describe how to satisfy it.
    const body = await response.text();
    expect(body).not.toContain('CRON_SECRET');
    expect(body).not.toContain('Bearer');
    expect(body.length).toBeLessThan(200);
  });

  test('a wrong bearer secret is refused too', async ({ request }) => {
    const response = await request.get('/api/cron/security-scan', {
      headers: { Authorization: 'Bearer definitely-not-the-secret' },
    });
    expect(REFUSED, `unexpected status ${response.status()}`).toContain(response.status());
  });

  test('the pass never runs for an unauthenticated caller', async ({ request }) => {
    // A scan summary in the body would mean the guard let it through.
    const response = await request.get('/api/cron/security-scan');
    const body = await response.text();
    expect(body).not.toContain('incidentsOpened');
    expect(body).not.toContain('eventsScanned');
  });
});

test.describe('unrouted API paths are refused tersely', () => {
  // The catch-all records enumeration attempts. Its RESPONSE must give an
  // enumerator nothing: no route listing, no framework fingerprint, no hint
  // that the probe was noticed.
  test('an unknown API path returns a bare 404', async ({ request }) => {
    const response = await request.get('/api/v1/users');
    expect(response.status()).toBe(404);

    const body = await response.text();
    expect(body.length).toBeLessThan(120);
    expect(body.toLowerCase()).not.toContain('route');
    expect(body.toLowerCase()).not.toContain('did you mean');
    expect(body.toLowerCase()).not.toContain('next');
  });

  test('a path matching an attack signature gets the same terse 404', async ({ request }) => {
    // Recording happens server-side; the attacker must not be able to tell
    // the difference between a probe that was classified and one that was not.
    const plain = await request.get('/api/nothing-here');
    const suspicious = await request.get('/api/.env');
    expect(suspicious.status()).toBe(plain.status());
    expect(await suspicious.text()).toBe(await plain.text());
  });

  test('a real API route is not shadowed by the catch-all', async ({ request }) => {
    // /api/health must still be REACHED — the catch-all only sees paths that
    // would otherwise have 404'd, and Next gives every more-specific route
    // priority over it.
    //
    // Asserting on the health VERDICT would be wrong here: /api/health
    // returns 503 whenever a dependency probe fails, which it legitimately
    // does in a local checkout with no reachable Zima Storage. What this test
    // is about is which handler answered, so it asserts exactly that — the
    // route's own JSON body, and never the catch-all's 404.
    const response = await request.get('/api/health');
    expect(response.status(), 'the catch-all swallowed a real route').not.toBe(404);

    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
    expect(body).not.toHaveProperty('error');
  });
});
