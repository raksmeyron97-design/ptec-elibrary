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
};

export const ABOUT_NAV_ITEMS = [
  {
    labelKey: "ourJourney",
    href: "/about/our-journey",
    icon: Milestone,
    group: "general",
  },
  {
    labelKey: "contact",
    href: "/contact",
    icon: Mail,
    group: "general",
  },
  {
    labelKey: "libraryRules",
    href: "/about/rules",
    icon: ScrollText,
    group: "library",
  },
  {
    labelKey: "libraryTimings",
    href: "/about/timings",
    icon: Clock3,
    group: "library",
  },
  {
    labelKey: "libraryCollection",
    href: "/about/collection",
    icon: BookCopy,
    group: "library",
  },
  {
    labelKey: "libraryCommittee",
    href: "/about/committee",
    icon: UsersRound,
    group: "library",
  },
  {
    labelKey: "libraryTeam",
    href: "/about/team",
    icon: Users,
    group: "library",
  },
] satisfies AboutNavItem[];

export function isRouteSegmentActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isAboutItemActive(pathname: string, item: AboutNavItem) {
  return isRouteSegmentActive(pathname, item.href);
}

export function isAboutSectionActive(pathname: string) {
  return (
    pathname === "/about" ||
    pathname.startsWith("/about/") ||
    ABOUT_NAV_ITEMS.some((item) => isAboutItemActive(pathname, item))
  );
}
