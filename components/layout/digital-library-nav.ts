import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  GraduationCap,
  Landmark,
  Newspaper,
  Waypoints,
} from "lucide-react";
import { JOURNALS_PATH, PTEC_PUBLICATIONS_URL } from "@/lib/journals/urls";

export type DigitalLibraryLabelKey =
  | "eBooks"
  | "theses"
  | "journals"
  | "learningPaths"
  | "svaLibrary"
  | "ptecPublications";

export type DigitalLibraryDescriptionKey =
  | "digitalLibraryBooksDescription"
  | "digitalLibraryThesesDescription"
  | "digitalLibraryJournalsDescription"
  | "digitalLibraryPathsDescription"
  | "digitalLibrarySvaDescription"
  | "digitalLibraryPtecPublicationsDescription";

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
  // The library's own scholarly-article collection. It was labelled
  // "Publications" until 0148; "Publications" now means the college's official
  // publications page, which is the external item at the end of this list.
  {
    labelKey: "journals",
    descriptionKey: "digitalLibraryJournalsDescription",
    href: JOURNALS_PATH,
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
  // PTEC's official publications live on the college website, not in the
  // library. External on every surface that renders this list (new tab, the
  // external-link icon, an sr-only "opens in a new tab"), grouped under the
  // same "elsewhere" heading as SVA — never routed through /publications on
  // this origin. lib/journals/urls.test.ts pins the URL.
  {
    labelKey: "ptecPublications",
    descriptionKey: "digitalLibraryPtecPublicationsDescription",
    href: PTEC_PUBLICATIONS_URL,
    icon: Landmark,
    external: true,
  },
] satisfies DigitalLibraryItem[];

export function isRouteSegmentActive(pathname: string | null | undefined, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isDigitalLibraryItemActive(
  pathname: string | null | undefined,
  item: DigitalLibraryItem,
) {
  if (!pathname || item.external) return false;
  return isRouteSegmentActive(pathname, item.href);
}

export function isDigitalLibrarySectionActive(pathname: string | null | undefined) {
  if (!pathname) return false;
  return DIGITAL_LIBRARY_ITEMS.some((item) =>
    isDigitalLibraryItemActive(pathname, item)
  );
}
