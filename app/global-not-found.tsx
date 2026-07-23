import RootShell from "@/components/layout/RootShell";
import NotFoundContent from "@/components/layout/NotFoundContent";
import { routing } from "@/i18n/routing";
import { identityMetadata, rootViewport } from "@/app/root-metadata";

export async function generateMetadata() {
  return identityMetadata(routing.defaultLocale as "en" | "km", "Page not found");
}
export const viewport = rootViewport;

/**
 * Requests that match no route at all — including `/__not-found__`, which
 * middleware rewrites to when it needs a *real* HTTP 404 (inside the route tree
 * the (public) loading boundary streams a 200 shell before notFound() could set
 * the status). Because there is no single app/layout.tsx any more, this file
 * owns its own <html>; that is what global-not-found is for.
 *
 * It renders in the DEFAULT LOCALE, always. Next prerenders this page and gives
 * it no route params, so there is nothing to read the locale from — and reading
 * the cookie instead throws "Page changed from static to dynamic at runtime" on
 * first hit, which turned every unknown /books/<slug> into a 500 rather than a
 * 404. (`export const dynamic` does not help: this is not a real route.)
 *
 * Locale-correct 404s still exist where they matter: notFound() from inside the
 * public tree renders app/[locale]/not-found.tsx, which sits under the [locale]
 * layout and keeps the navbar, footer and language.
 */
export default function GlobalNotFound() {
  return (
    <RootShell locale={routing.defaultLocale}>
      <NotFoundContent locale={routing.defaultLocale} />
    </RootShell>
  );
}
