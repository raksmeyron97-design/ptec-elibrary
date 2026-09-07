import type { LucideIcon } from "lucide-react";
import {
  BookCopy,
  Clock3,
  Mail,
  Milestone,
  ScrollText,
  Users,
  UsersRound,
} from "lucide-react";

export type AboutNavLabelKey =
  | "ourJourney"
  | "contact"
  | "libraryRules"
  | "libraryTimings"
  | "libraryCollection"
  | "libraryCommittee"
  | "libraryTeam";

export type AboutNavGroup = "general" | "library";

export type AboutNavItem = {
  labelKey: AboutNavLabelKey;
  href: string;
  icon: LucideIcon;
  group: AboutNavGroup;
  /** Key inside the `about` namespace — the same one-line description the
   *  About section's related-pages cards use, so the menu and the cards
   *  can never describe a page two different ways. */
  descriptionKey: `nav.${string}`;
};

/** Group order + heading keys, shared by the desktop popover and the mobile
 *  accordion so the two can't group the same pages differently. */
export const ABOUT_NAV_GROUPS = [
  { id: "general", labelKey: "aboutGroupGeneral" },
  { id: "library", labelKey: "aboutGroupLibraryInfo" },
] satisfies Array<{
  id: AboutNavGroup;
  labelKey: "aboutGroupGeneral" | "aboutGroupLibraryInfo";
}>;

export const ABOUT_NAV_ITEMS = [
  {
    labelKey: "ourJourney",
    href: "/about/our-journey",
    icon: Milestone,
    group: "general",
    descriptionKey: "nav.ourJourney",
  },
  {
    labelKey: "contact",
    href: "/contact",
    icon: Mail,
    group: "general",
    descriptionKey: "nav.contact",
  },
  {
    labelKey: "libraryRules",
    href: "/about/rules",
    icon: ScrollText,
    group: "library",
    descriptionKey: "nav.rules",
  },
  {
    labelKey: "libraryTimings",
    href: "/about/timings",
    icon: Clock3,
    group: "library",
    descriptionKey: "nav.timings",
  },
  {
    labelKey: "libraryCollection",
    href: "/about/collection",
    icon: BookCopy,
    group: "library",
    descriptionKey: "nav.collection",
  },
  {
    labelKey: "libraryCommittee",
    href: "/about/committee",
    icon: UsersRound,
    group: "library",
    descriptionKey: "nav.committee",
  },
  {
    labelKey: "libraryTeam",
    href: "/about/team",
    icon: Users,
    group: "library",
    descriptionKey: "nav.team",
  },
] satisfies AboutNavItem[];

export function isRouteSegmentActive(pathname: string | null | undefined, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isAboutItemActive(pathname: string | null | undefined, item: AboutNavItem) {
  return isRouteSegmentActive(pathname, item.href);
}

export function isAboutSectionActive(pathname: string | null | undefined) {
  if (!pathname) return false;
  return (
    pathname === "/about" ||
    pathname.startsWith("/about/") ||
    ABOUT_NAV_ITEMS.some((item) => isAboutItemActive(pathname, item))
  );
}
