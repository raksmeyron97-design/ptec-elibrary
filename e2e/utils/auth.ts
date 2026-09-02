import type { Page } from "@playwright/test";

/**
 * Sign in as a seeded reader through the real login UI.
 *
 * Uses the seeded `student@ptec.local` account (supabase/seed.sql). The login
 * form gates on a Turnstile token; the e2e dev server runs with Cloudflare's
 * "always passes" TEST site key (playwright.config.ts), so the widget
 * auto-succeeds and `@supabase/ssr` writes a genuine session cookie — no
 * hand-crafted cookie, no production auth bypass.
 *
 * Returns true on success. Never throws: callers that only need auth as a
 * precondition can `test.skip(!ok, ...)` so an environment where login can't
 * complete (no Turnstile network, captcha misconfig) skips rather than fails.
 */
export async function signInSeededReader(
  page: Page,
  opts: { email?: string; password?: string; next?: string } = {},
): Promise<boolean> {
  const email = opts.email ?? "student@ptec.local";
  const password = opts.password ?? "Password123!";
  const next = opts.next ?? "/dashboard";

  try {
    await page.goto(`/auth/login?callbackUrl=${encodeURIComponent(next)}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);

    // Submit is disabled until the Turnstile token arrives.
    const submit = page.getByRole("button", { name: /sign in/i }).first();
    await submit.waitFor({ state: "visible", timeout: 20_000 });
    await page
      .waitForFunction(
        () => {
          const b = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
          return !!b && !b.disabled;
        },
        undefined,
        { timeout: 20_000 },
      )
      .catch(() => {});
    await submit.click();

    // Success navigates away from /auth/login to the callback.
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/login"), {
      timeout: 20_000,
    });
    return !new URL(page.url()).pathname.startsWith("/auth/login");
  } catch {
    return false;
  }
}

/**
 * Sign in as the seeded reader by installing a REAL GoTrue session.
 *
 * `signInSeededReader` above drives the actual login form, which is the right
 * test for the login form. It is the wrong dependency for a spec about
 * something else: the form is gated on a Cloudflare Turnstile widget, and when
 * that widget cannot complete — no egress, a challenge that stalls, a headless
 * quirk — the spec does not fail honestly, it hangs until the test timeout.
 *
 * This path asks the local GoTrue for a password grant with the seeded
 * credentials and writes the result into the cookie @supabase/ssr reads. The
 * token is genuine and the server still verifies it on every request, so
 * nothing about authorisation is faked or bypassed — only the captcha widget
 * is stepped around.
 *
 * Returns false (never throws) when Supabase is unreachable, so callers can
 * `test.skip(!ok, ...)`.
 */
export async function installSeededReaderSession(
  page: Page,
  opts: { email?: string; password?: string; origin?: string } = {},
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;

  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: opts.email ?? "student@ptec.local",
        password: opts.password ?? "Password123!",
      }),
    });
    if (!res.ok) return false;
    const session = await res.json();
    if (!session?.access_token) return false;

    // @supabase/ssr keys the cookie by the project ref — the first label of the
    // Supabase host — and chunks anything over ~3.2 KB.
    const ref = new URL(url).hostname.split(".")[0];
    const payload = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
    const chunks: string[] = [];
    for (let i = 0; i < payload.length; i += 3180) chunks.push(payload.slice(i, i + 3180));
    // Cookies are set by URL so the domain/path come out right whether the
    // suite runs against localhost or a deployed origin.
    const origin =
      opts.origin ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

    await page.context().addCookies(
      chunks.length === 1
        ? [{ name: `sb-${ref}-auth-token`, value: payload, url: origin }]
        : chunks.map((value, i) => ({ name: `sb-${ref}-auth-token.${i}`, value, url: origin })),
    );
    return true;
  } catch {
    return false;
  }
}
