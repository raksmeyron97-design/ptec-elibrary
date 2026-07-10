import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  GraduationCap,
  Newspaper,
  Waypoints,
} from "lucide-react";

export type DigitalLibraryLabelKey =
  | "eBooks"
  | "theses"
  | "publications"
  | "learningPaths"
  | "svaLibrary";

export type DigitalLibraryDescriptionKey =
  | "digitalLibraryBooksDescription"
  | "digitalLibraryThesesDescription"
  | "digitalLibraryPublicationsDescription"
  | "digitalLibraryPathsDescription"
  | "digitalLibrarySvaDescription";

export type DigitalLibraryItem = {
  labelKey: DigitalLibraryLabelKey;
  descriptionKey: DigitalLibraryDescriptionKey;
  href: string;
  icon: LucideIcon;
  imageSrc?: string;
  external?: boolean;
};

export const DIGITAL_LIBRARY_ITEMS = [
  {
    labelKey: "eBooks",
    descriptionKey: "digitalLibraryBooksDescription",
    href: "/books",
    icon: BookOpen,
  },
  {
    labelKey: "theses",
    descriptionKey: "digitalLibraryThesesDescription",
    href: "/theses",
    icon: GraduationCap,
  },
  {
    labelKey: "publications",
    descriptionKey: "digitalLibraryPublicationsDescription",
    href: "/publications",
    icon: Newspaper,
  },
  {
    labelKey: "learningPaths",
    descriptionKey: "digitalLibraryPathsDescription",
    href: "/paths",
    icon: Waypoints,
  },
  {
    labelKey: "svaLibrary",
    descriptionKey: "digitalLibrarySvaDescription",
    href: "https://svacamelib.org/",
    icon: BookOpen,
    imageSrc: "/sva.jpg",
    external: true,
  },
] satisfies DigitalLibraryItem[];

export function isRouteSegmentActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isDigitalLibraryItemActive(
  pathname: string,
  item: DigitalLibraryItem,
) {
  if (item.external) return false;
  return isRouteSegmentActive(pathname, item.href);
}

export function isDigitalLibrarySectionActive(pathname: string) {
  return DIGITAL_LIBRARY_ITEMS.some((item) =>
    isDigitalLibraryItemActive(pathname, item),
  );
}
