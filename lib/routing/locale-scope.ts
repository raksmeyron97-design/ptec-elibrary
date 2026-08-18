// lib/routing/locale-scope.ts
//
// Which in-app routes participate in the locale scheme, and which do not.
//
// Only `app/[locale]/(public)` is locale-routed. `app/(auth)` and
// `app/(admin)` are deliberately outside it — they are cookie-driven and
// unprefixed — as are the API routes and the PWA offline shell.
//
// This matters because `Link` from `@/i18n/navigation` prefixes its href with
// the active locale. Point it at an unscoped route while a Khmer reader is on
// the site and it emits `/km/auth/signup`, which has no matching route and
// 404s. That is not theoretical: it was live on the homepage FAQ ("Do I need
// an account?" → Learn more) and latent in the mobile profile sheet's "Sign
// in", both found by the homepage link audit in e2e/home-ia.spec.ts.
//
// CLAUDE.md states the rule in prose. This file makes it checkable, and
// lib/routing/locale-scope.test.ts enforces it across the source tree.

/** Route prefixes that live OUTSIDE the `[locale]` segment. */
export const UNSCOPED_PREFIXES = ["/auth/", "/admin", "/api/", "/~offline"] as const;

/**
 * True when `href` should be rendered with the locale-aware `Link`
 * (`@/i18n/navigation`); false when it needs a plain `next/link`.
 *
 * Absolute URLs, mailto:/tel: and fragments are not this module's business and
 * are reported as unscoped — a plain anchor is correct for all of them.
 */
export function isLocaleScoped(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  return !UNSCOPED_PREFIXES.some(
    (prefix) => href === prefix.replace(/\/$/, "") || href.startsWith(prefix),
  );
}
