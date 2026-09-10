// components/ui/home/CollectionGrid.tsx
// Homepage — "Browse by Collection": the four digital collections as equal,
// tappable cards, plus SVA Library as a visually distinct external card.
//
// WHY THIS READS THE NAV CONFIG. The collections are NOT re-declared here.
// DIGITAL_LIBRARY_ITEMS is the same list the desktop mega menu and the mobile
// accordion render, so the homepage grid and the menu are structurally
// incapable of disagreeing about what the library contains, what a collection
// is called, or where it links. Adding a collection to that one file adds it
// to all three surfaces; there is no second list to forget.
//
// WHY THE COUNTS COME FROM getCollectionStats(). Same rule as <TrustBar>: it
// is the single source for public counts (lib/collection-stats.ts), and
// lib/resource-stats-consistency.test.ts fails any page that runs its own
// count query. Stats and navigation degrade INDEPENDENTLY here — if the stats
// view is unavailable, getCollectionStats() returns null and the cards render
// without their count line rather than the section disappearing. The count is
// the supporting detail; the four links are the point, and a reader who cannot
// see "380 theses" can still get to the theses.
//
// A count of ZERO is dropped too, the same rule <TrustBar> applies to its
// tiles. The card still links — the collection exists and the nav lists it —
// but "0 items" printed under two of four collections on the homepage told
// every first-time visitor the library was mostly empty shelves, which is
// neither the message nor, as the collection grows, the truth for long.
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getCollectionStats } from "@/lib/collection-stats";
import {
  DIGITAL_LIBRARY_ITEMS,
  type DigitalLibraryLabelKey,
} from "@/components/layout/digital-library-nav";
import { HomeSection, SectionHeader } from "./HomeSection";

/** Collection → the getCollectionStats() field that counts it. `svaLibrary` is
 *  absent deliberately: it is somebody else's catalogue and we do not know (or
 *  claim) its size. */
const COUNT_FIELD: Partial<
  Record<DigitalLibraryLabelKey, "books" | "theses" | "publications" | "learningPaths">
> = {
  eBooks: "books",
  theses: "theses",
  publications: "publications",
  learningPaths: "learningPaths",
};

/** Per-collection icon plate. Indexed by labelKey rather than by position so
 *  reordering the nav config cannot silently reassign colours. */
const PLATE: Record<DigitalLibraryLabelKey, string> = {
  eBooks: "bg-brand/10 text-brand",
  theses: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  publications: "bg-accent/12 text-accent-text",
  learningPaths: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  svaLibrary: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
};

const ArrowIcon = (
  <svg
    className="h-4 w-4 shrink-0 text-text-muted transition-all group-hover:translate-x-0.5 group-hover:text-brand"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default async function CollectionGrid() {
  const [t, tNav, stats] = await Promise.all([
    getTranslations("home"),
    getTranslations("nav"),
    getCollectionStats(),
  ]);

  const internal = DIGITAL_LIBRARY_ITEMS.filter((item) => !item.external);
  const sva = DIGITAL_LIBRARY_ITEMS.find((item) => item.external);

  return (
    <HomeSection surface="paper" labelledBy="collection-grid-title">
      <SectionHeader
        id="collection-grid-title"
        tone="accent"
        eyebrow={t("collectionsGridEyebrow")}
        title={t("collectionsGridTitle")}
      />

      {/* ── The four PTEC collections ──
          Two per row on phones: four stacked cards measured 1,160 px on a
          375 px screen for four labels and a count each. */}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {internal.map((item) => {
          const { labelKey, descriptionKey, href, icon: Icon } = item;
          const field = COUNT_FIELD[labelKey];
          const count = stats && field ? stats[field] : null;
          const label = tNav(labelKey);

          return (
            <li key={labelKey}>
              <Link
                href={href}
                aria-label={t("collectionsGridCardLabel", { collection: label })}
                className="group flex h-full min-h-[148px] flex-col rounded-xl border border-divider bg-bg-surface p-4 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 sm:min-h-[168px] sm:p-5"
              >
                <span
                  className={`mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 sm:mb-4 sm:h-12 sm:w-12 ${PLATE[labelKey]}`}
                  aria-hidden
                >
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.9} />
                </span>

                <span className="block font-khmer-serif text-[15px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand sm:text-[16px]">
                  {label}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-text-muted sm:text-[13px]">
                  {tNav(descriptionKey)}
                </span>

                <span className="mt-auto flex items-center justify-between gap-2 pt-3 sm:pt-4">
                  {/* No count line when the stats view is down OR the count
                      is zero — see the header comment. */}
                  <span className="text-[12.5px] font-semibold text-text-muted">
                    {count ? t("collectionsGridItemCount", { count }) : ""}
                  </span>
                  {ArrowIcon}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* ── SVA Library — a partner catalogue, not ours ──
          Visually separated (dashed border, full width, own row) so nobody
          reads it as a fifth PTEC collection.

          The "opens in a new tab" note is real text, not an icon-only cue,
          and it sits INSIDE the link — so it is already part of the computed
          accessible name. It deliberately carries no aria-describedby: the
          Chrome a11y tree showed that pointing one at this same span made it
          both the name's tail and the description, so a screen reader
          announced "…បើកក្នុងផ្ទាំងថ្មី" twice in a row. */}
      {sva && (
        <div className="mt-3 sm:mt-4">
          <a
            href={sva.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-[76px] flex-col gap-3 rounded-xl border border-dashed border-divider bg-bg-surface px-4 py-4 transition-all duration-200 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${PLATE.svaLibrary}`}
              aria-hidden
            >
              <sva.icon className="h-5 w-5" strokeWidth={1.9} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block font-khmer-serif text-[15px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
                {tNav(sva.labelKey)}
              </span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-text-muted">
                {tNav(sva.descriptionKey)}
              </span>
            </span>

            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-text-muted">
              <svg
                className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {t("collectionsGridExternal")}
            </span>
          </a>
        </div>
      )}
    </HomeSection>
  );
}
