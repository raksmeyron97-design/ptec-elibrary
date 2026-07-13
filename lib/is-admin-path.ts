/**
 * True for any route inside the admin panel.
 *
 * The root layout mounts globally-shared client components (notably the public
 * ⌘K SearchModal). Those must NOT run inside the admin panel: the public modal
 * searches the *public* library and navigates to public routes, it hijacks ⌘K
 * from AdminCommandPalette, and it needlessly ships its chunk + gcse.css on
 * every admin page. Guard such components with this predicate.
 *
 * Admin routes are deliberately NOT locale-prefixed (see i18n/routing.ts), so a
 * bare "/admin" prefix check is exact — there is no "/km/admin".
 */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
