"use client";
// components/ui/dashboard/LibraryTabLink.tsx
// A link to one My Library tab. A plain click selects the tab in place and
// scrolls to the section; a modified click (new tab, new window) and no-JS
// both follow the real href. See library-tab.ts for why this is not a
// `<Link href="?tab=…">`.
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import {
  LIBRARY_SECTION_ID, libraryTabHref, tabButtonId, writeLibraryTab, type LibraryTab,
} from "@/components/ui/dashboard/library-tab";

export default function LibraryTabLink({
  tab, className, children, "aria-label": ariaLabel,
}: {
  tab: LibraryTab;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Link
      href={libraryTabHref(tab)}
      className={className}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        writeLibraryTab(tab, LIBRARY_SECTION_ID);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(LIBRARY_SECTION_ID)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        // Keyboard users land ON the tab they asked for, not back at the tile.
        document.getElementById(tabButtonId(tab))?.focus({ preventScroll: true });
      }}
    >
      {children}
    </Link>
  );
}
