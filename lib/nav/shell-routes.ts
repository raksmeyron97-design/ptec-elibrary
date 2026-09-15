// lib/nav/shell-routes.ts
// Which tab of the phone tab bar owns a route, and which routes hide the bar.
//
// Pure and locale-agnostic on purpose: the tab bar reads a locale-less path
// (next-intl's usePathname), the assistant reads a raw one (next/navigation,
// `/km/...`), and they must reach the same answer. Before this module the
// assistant carried its own reader-route regex and the tab bar had none, so
// the two could only agree by coincidence.

export type ShellTab = "home" | "search" | "library" | "paths" | "profile";

/** Everything a reader reaches through the Library sheet. Order is the
 *  sheet's order; the tab lights for any of them. */
export const LIBRARY_ROUTES = [
  "/books",
  "/theses",
  "/journals",
  "/catalogs",
  "/subjects",
  "/authors",
] as const;

/** A reader's own things: the dashboard, their collections, their device. */
const PROFILE_ROUTES = ["/dashboard", "/lists", "/offline-books"] as const;

/** `/km/books` → `/books`, `/en` → `/`. Anything else passes through. */
export function stripLocale(pathname: string): string {
  const stripped = pathname.replace(/^\/(?:km|en)(?=\/|$)/, "");
  return stripped === "" ? "/" : stripped;
}

function under(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/**
 * The dedicated reading route. It hides the tab bar: the reader has its own
 * top bar (with Back) and bottom bar, and two stacked bottom bars cost a
 * phone ~74 px of page for navigation the reader is not using mid-page.
 *
 * The offline reader is deliberately NOT here — offline, the tab bar's
 * links to the offline library are the way back out.
 */
export function isImmersiveReaderRoute(pathname: string): boolean {
  return /^\/books\/[^/]+\/read\/?$/.test(stripLocale(pathname));
}

export function tabBarVisible(pathname: string): boolean {
  return !isImmersiveReaderRoute(pathname);
}

/**
 * Routes where the assistant's floating button steps aside entirely:
 *  - the reading routes, which own the bottom-right corner (their panel
 *    toggle sits exactly under the FAB on phones) and are a focused surface;
 *  - a learning-path detail page, which docks its own primary action
 *    ("Start learning") along the bottom edge on phones.
 * Moved here from a regex private to AskWidget, so the tab bar and the
 * assistant read the same definition of "the reader".
 */
export function assistantFabHidden(pathname: string): boolean {
  const path = stripLocale(pathname);
  return isImmersiveReaderRoute(path) || under(path, "/offline-reader") || /^\/paths\/[^/]+\/?$/.test(path);
}

/**
 * Routes where the FAB steps aside on PHONES only, because the page docks its
 * own assistant entry point there: a book's detail page, whose read dock
 * carries "Ask about this book", and a journal article, whose action dock
 * carries "Ask about this article". From `lg` the FAB is back — no dock.
 */
export function assistantFabHiddenOnPhone(pathname: string): boolean {
  const path = stripLocale(pathname);
  return /^\/books\/[^/]+\/?$/.test(path) || /^\/journals\/articles\/[^/]+\/?$/.test(path);
}

/** The tab that should read as current, or null (e.g. /about, /posts). */
export function activeTab(pathname: string): ShellTab | null {
  const path = stripLocale(pathname);
  if (path === "/") return "home";
  if (under(path, "/search")) return "search";
  if (under(path, "/paths")) return "paths";
  if (LIBRARY_ROUTES.some((base) => under(path, base))) return "library";
  if (PROFILE_ROUTES.some((base) => under(path, base))) return "profile";
  return null;
}
