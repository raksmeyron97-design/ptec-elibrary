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
