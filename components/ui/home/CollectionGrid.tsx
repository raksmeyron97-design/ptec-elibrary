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
import { Link } from "@/i18n/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { getCollectionStats } from "@/lib/collection-stats";
import {
  DIGITAL_LIBRARY_ITEMS,
  type DigitalLibraryLabelKey,
} from "@/components/layout/digital-library-nav";

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
  const [t, tNav, locale, stats] = await Promise.all([
    getTranslations("home"),
    getTranslations("nav"),
    getLocale(),
    getCollectionStats(),
  ]);

  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
  const internal = DIGITAL_LIBRARY_ITEMS.filter((item) => !item.external);
  const sva = DIGITAL_LIBRARY_ITEMS.find((item) => item.external);

  return (
    <section
      className="border-b border-divider/60 bg-bg-surface"
      aria-labelledby="collection-grid-title"
    >
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span
              className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand"
              aria-hidden
            />
            <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
              {t("collectionsGridEyebrow")}
            </span>
          </div>
          <h2
            id="collection-grid-title"
            className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
            style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
          >
            {t("collectionsGridTitle")}
          </h2>
        </div>

        {/* ── The four PTEC collections ── */}
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  className="group flex h-full min-h-[168px] flex-col rounded-xl border border-divider bg-paper p-5 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  <span
                    className={`mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${PLATE[labelKey]}`}
                    aria-hidden
                  >
                    <Icon className="h-6 w-6" strokeWidth={1.9} />
                  </span>

                  <span className="block font-khmer-serif text-[16px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
                    {label}
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-text-muted">
                    {tNav(descriptionKey)}
                  </span>

                  <span className="mt-auto flex items-center justify-between gap-2 pt-4">
                    {/* No count line at all when the stats view is down —
                        never a "0", which would read as an empty collection. */}
                    <span className="text-[12.5px] font-semibold text-text-muted">
                      {count === null ? "" : t("collectionsGridItemCount", { count })}
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
          <div className="mt-4">
            <a
              href={sva.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-[76px] flex-col gap-3 rounded-xl border border-dashed border-divider bg-paper px-5 py-4 transition-all duration-200 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 sm:flex-row sm:items-center sm:gap-4"
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

              <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-text-muted">
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
      </div>
    </section>
  );
}
