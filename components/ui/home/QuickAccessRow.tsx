// components/ui/home/QuickAccessRow.tsx
// Phones only: one swipeable row of the library's collections, directly under
// the hero search — the "what is in here?" answer for a reader who has
// nothing to type yet.
//
// Server-rendered links, no client JS. The digital collections come from
// DIGITAL_LIBRARY_ITEMS, the list the mega-menu, the collection grid and the
// tab bar's Library sheet already read, so none of them can disagree about
// what the library holds. Learning Paths is left out on purpose: it is a tab
// of its own and the very next band on this page.
//
// Glass on INK (.glass-ink): these chips sit on the dark hero photograph,
// which is not re-themed, so they are white-on-dark in both themes.
import type { ComponentType } from "react";
import { getTranslations } from "next-intl/server";
import { Landmark, PenLine, Tags, type LucideProps } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DIGITAL_LIBRARY_ITEMS, type DigitalLibraryLabelKey } from "@/components/layout/digital-library-nav";

type Item = { href: string; labelKey: DigitalLibraryLabelKey | "booksInLibrary" | "subjects" | "authors"; Icon: ComponentType<LucideProps> };

export default async function QuickAccessRow() {
  const [t, tHome] = await Promise.all([getTranslations("nav"), getTranslations("home")]);

  const items: Item[] = [
    ...DIGITAL_LIBRARY_ITEMS.filter((item) => !item.external && item.href !== "/paths").map((item) => ({
      href: item.href,
      labelKey: item.labelKey,
      Icon: item.icon,
    })),
    { href: "/catalogs", labelKey: "booksInLibrary", Icon: Landmark },
    { href: "/subjects", labelKey: "subjects", Icon: Tags },
    { href: "/authors", labelKey: "authors", Icon: PenLine },
  ];

  return (
    <nav aria-label={tHome("quickAccessLabel")} className="lg:hidden">
      <ul className="scroll-row -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {items.map(({ href, labelKey, Icon }) => (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              // A signpost, not a committed destination: six listing payloads
              // are not worth prefetching for a row most readers scroll past.
              prefetch={false}
              className="glass-ink inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold text-white transition-colors hover:border-cyan-300/60 hover:bg-white/15 [--focus-color:var(--color-gold-300)]"
            >
              <Icon className="h-4 w-4 shrink-0 text-gold-300" strokeWidth={2} aria-hidden="true" />
              {t(labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
