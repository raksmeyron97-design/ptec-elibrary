// lib/about/nav.ts
//
// The About sub-navigation model: one ordered list that drives the sticky sub
// nav, the breadcrumb trail, the previous/next pager and the "related pages"
// block on all five pages. Adding a page here wires it into every one of them.
//
// `labelKey` points at the EXISTING `nav` message namespace, which already
// carries these labels in both locales (messages/{en,km}.json). Do not
// duplicate them into the `about` namespace — one label, one place.

import { ABOUT_PAGE_KEYS, type AboutPageKey } from "./types";

export type AboutNavItem = {
  key: AboutPageKey;
  /** Locale-agnostic path — pass to `Link` from @/i18n/navigation, which
   *  adds the /km prefix. Never hard-code "/km/..." at a call site. */
  href: string;
  /** Key inside the `nav` message namespace. */
  labelKey: string;
  /** Key inside the `about` namespace for the one-line description used by
   *  the related-pages cards. */
  descriptionKey: string;
  /** Icon key, resolved to a lucide component by the rendering component. */
  icon: "milestone" | "scale" | "clock" | "library" | "users";
};

export const ABOUT_NAV: readonly AboutNavItem[] = [
  {
    key: "ourJourney",
    href: "/about/our-journey",
    labelKey: "ourJourney",
    descriptionKey: "nav.ourJourney",
    icon: "milestone",
  },
  {
    key: "rules",
    href: "/about/rules",
    labelKey: "libraryRules",
    descriptionKey: "nav.rules",
    icon: "scale",
  },
  {
    key: "timings",
    href: "/about/timings",
    labelKey: "libraryTimings",
    descriptionKey: "nav.timings",
    icon: "clock",
  },
  {
    key: "collection",
    href: "/about/collection",
    labelKey: "libraryCollection",
    descriptionKey: "nav.collection",
    icon: "library",
  },
  {
    key: "team",
    href: "/about/team",
    labelKey: "libraryTeam",
    descriptionKey: "nav.team",
    icon: "users",
  },
] as const;

/** Lookup that never returns undefined for a valid key. */
export function aboutNavItem(key: AboutPageKey): AboutNavItem {
  const item = ABOUT_NAV.find((i) => i.key === key);
  // ABOUT_NAV is asserted complete by lib/about/nav.test.ts.
  if (!item) throw new Error(`[about/nav] unknown page key: ${key}`);
  return item;
}

/**
 * The previous and next page in reading order. The list does NOT wrap: the
 * first page has no previous and the last has no next, so the pager can't
 * send someone in a circle.
 */
export function aboutPager(key: AboutPageKey): {
  previous: AboutNavItem | null;
  next: AboutNavItem | null;
} {
  const index = ABOUT_NAV.findIndex((i) => i.key === key);
  if (index < 0) return { previous: null, next: null };
  return {
    previous: index > 0 ? ABOUT_NAV[index - 1] : null,
    next: index < ABOUT_NAV.length - 1 ? ABOUT_NAV[index + 1] : null,
  };
}

/** Every page except the current one, for the "related pages" block. */
export function relatedAboutPages(key: AboutPageKey): AboutNavItem[] {
  return ABOUT_NAV.filter((i) => i.key !== key);
}

/**
 * Is `pathname` (as returned by the locale-aware usePathname(), i.e. WITHOUT
 * the /km prefix) the given nav item? Used for aria-current="page".
 *
 * Compares against the item path and its trailing-slash form only — a prefix
 * match would light up two items if a future page nested under another.
 */
export function isAboutPathActive(pathname: string, href: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === href;
}

export { ABOUT_PAGE_KEYS };
export type { AboutPageKey };
