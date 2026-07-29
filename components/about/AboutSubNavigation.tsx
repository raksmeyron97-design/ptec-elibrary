"use client";

// components/about/AboutSubNavigation.tsx
//
// The sticky sub-navigation shared by all five About pages. This is what turns
// them from five standalone documents into one section.
//
// It is a client component for exactly two reasons — the active-item test
// needs the current path, and the active item must be scrolled into view on a
// narrow screen. Everything else (labels, order, hrefs) comes from the server
// via lib/about/nav.ts.
//
// Behaviour notes that are load-bearing:
//
//   • STICKY AT top-0. The site header (components/layout/Navbar) is
//     `position: relative`, not sticky, so there is no header height to
//     offset against — a `top-16` here would leave a 64px gap of page
//     scrolling past under the bar.
//   • ONE ROW, ALWAYS. Khmer labels are long ("បណ្ដុំឯកសារបណ្ណាល័យ"), and
//     letting five of them wrap produces a two-row bar that eats a third of a
//     small screen. The strip scrolls horizontally instead, with the scrollbar
//     hidden and the active item scrolled into view.
//   • `scrollIntoView` uses `block: "nearest"` so bringing a horizontally
//     off-screen tab into view never also scrolls the PAGE vertically — with
//     the default `block: "start"` this bar jumped the reader past the hero on
//     every navigation.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Clock, Library, Milestone, Scale, Users, type LucideIcon } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { ABOUT_NAV, isAboutPathActive } from "@/lib/about/nav";

const ICONS: Record<string, LucideIcon> = {
  milestone: Milestone,
  scale: Scale,
  clock: Clock,
  library: Library,
  users: Users,
};

export default function AboutSubNavigation() {
  const t = useTranslations("about");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const active = activeRef.current;
    const scroller = scrollerRef.current;
    if (!active || !scroller) return;
    // Only intervene when the item is actually clipped; an unnecessary
    // scrollIntoView on a wide screen is a visible jitter on first paint.
    const itemBox = active.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    if (itemBox.left >= scrollerBox.left && itemBox.right <= scrollerBox.right) return;
    active.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div
      data-about-print="hide"
      className="sticky top-0 z-40 border-b border-divider bg-bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/80"
    >
      <nav aria-label={t("subnav.label")} className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div
          ref={scrollerRef}
          className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ABOUT_NAV.map((item) => {
            const active = isAboutPathActive(pathname, item.href);
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.key}
                href={item.href}
                ref={active ? activeRef : undefined}
                aria-current={active ? "page" : undefined}
                className={[
                  // min-h-11 keeps the touch target at the 44px floor even
                  // though the visual bar is shorter than that on desktop.
                  "group relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-sm transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring",
                  active
                    ? "font-semibold text-brand"
                    : "font-medium text-text-body hover:text-brand",
                ].join(" ")}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? "text-brand" : "text-text-muted group-hover:text-brand"}`}
                  aria-hidden="true"
                />
                {tNav(item.labelKey)}
                {/* The active underline is a sibling element rather than a
                    border, so switching pages (or languages) never changes the
                    item's box and the bar can't shift by a pixel. */}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full ${
                    active ? "bg-brand" : "bg-transparent"
                  }`}
                />
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
