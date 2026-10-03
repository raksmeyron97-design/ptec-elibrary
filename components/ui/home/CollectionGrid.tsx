// components/ui/home/CollectionGrid.tsx
// Homepage "Start here", left column — the collections: Books as a feature
// tile (with its five largest departments), then Theses, Journals, Learning
// Paths and the Physical Library as compact rows, then the external
// destinations (SVA Library, PTEC's official publications) as one line.
//
// WHY THIS READS THE NAV CONFIG. The digital collections are NOT re-declared
// here. DIGITAL_LIBRARY_ITEMS is the same list the desktop mega menu and the
// mobile accordion render, so the homepage and the menu are structurally
// incapable of disagreeing about what the library contains, what a collection
// is called, or where it links.
//
// WHY THE COUNTS COME FROM getCollectionStats(). Same rule as <TrustBar>: it
// is the single source for public counts (lib/collection-stats.ts), and
// lib/resource-stats-consistency.test.ts fails any page that runs its own
// count query. Stats and navigation degrade INDEPENDENTLY here — if the stats
// view is unavailable, getCollectionStats() returns null and the tiles render
// without their count rather than disappearing. The count is the supporting
// detail; the links are the point.
//
// A count under COLLECTION_COUNT_MIN_DISPLAY is dropped too, the same kind of
// floor <TrustBar> applies to its tiles (and PHYSICAL_CATALOG_MIN_DISPLAY for
// the Physical Library, the same floor the hero uses). The tile still links —
// the collection exists and the nav lists it — but "0 items" printed under two
// of four collections told every first-time visitor the library was mostly
// empty shelves, and "1 item" beside "1,734 items" undersold it just as badly.
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { ArrowRight, Library, type LucideIcon } from "lucide-react";
import { getCollectionStats, formatCount } from "@/lib/collection-stats";
import { getDepartmentCountsCached } from "@/lib/home-data";
import {
  DIGITAL_LIBRARY_ITEMS,
  type DigitalLibraryLabelKey,
} from "@/components/layout/digital-library-nav";
import { PHYSICAL_CATALOG_MIN_DISPLAY } from "./TrustBar";

/**
 * Minimum count for a collection tile to print its figure.
 *
 * Exported so the test states the boundary in terms of the shipped value
 * rather than re-typing it — same convention as PHYSICAL_CATALOG_MIN_DISPLAY.
 */
export const COLLECTION_COUNT_MIN_DISPLAY = 5;

/** How many departments the Books tile offers as chips. */
export const BOOKS_TILE_DEPARTMENTS = 5;

type CountField = "books" | "theses" | "publications" | "learningPaths" | "physicalCatalogs";

/** Collection → the getCollectionStats() field that counts it. The external
 *  destinations are absent deliberately: they are somebody else's catalogue
 *  and we do not know (or claim) their size. */
const COUNT_FIELD: Partial<Record<DigitalLibraryLabelKey, CountField>> = {
  eBooks: "books",
  theses: "theses",
  // The stats field keeps its name: it counts rows of the `publications`
  // table, which holds journal articles.
  journals: "publications",
  learningPaths: "learningPaths",
};

/** Per-collection icon plate, indexed by labelKey so reordering the nav
 *  config cannot silently reassign colours. */
const PLATE: Record<DigitalLibraryLabelKey | "physical", string> = {
  eBooks: "bg-brand/10 text-brand",
  theses: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  journals: "bg-accent/12 text-accent-text",
  learningPaths: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  svaLibrary: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
  ptecPublications: "bg-brand/10 text-brand",
  physical: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
};

const CARD =
  "rounded-xl border border-border bg-bg-surface shadow-sm transition duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0";

function Plate({ Icon, plate, size = "h-11 w-11" }: { Icon: LucideIcon; plate: string; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl ${size} ${plate}`} aria-hidden>
      <Icon className="h-5 w-5" strokeWidth={1.9} />
    </span>
  );
}

/** One compact collection row: icon, title, one-line description, count, arrow. */
function CollectionRow({
  href,
  label,
  ariaLabel,
  description,
  countText,
  countField,
  Icon,
  plate,
}: {
  href: string;
  label: string;
  ariaLabel: string;
  description: string;
  countText: string | null;
  countField: CountField;
  Icon: LucideIcon;
  plate: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`group flex h-full items-center gap-3 p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 sm:p-4 ${CARD}`}
    >
      <Plate Icon={Icon} plate={plate} size="h-10 w-10" />
      <span className="min-w-0 flex-1">
        <span className="block font-record text-[15.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-text-muted">{description}</span>
      </span>
      {/* data-collection-count: read by e2e/resource-stats.spec.ts to
          reconcile this figure with the collection's listing. */}
      {countText && (
        <span data-collection-count={countField} className="shrink-0 text-[12.5px] font-semibold tabular-nums text-text-muted">
          {countText}
        </span>
      )}
      <ArrowRight
        className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
        aria-hidden
      />
    </Link>
  );
}

export default async function CollectionGrid({ heading }: { heading?: ReactNode } = {}) {
  const [t, tNav, stats, locale, departments] = await Promise.all([
    getTranslations("home"),
    getTranslations("nav"),
    getCollectionStats(),
    getLocale(),
    getDepartmentCountsCached(),
  ]);

  const countOf = (field: CountField | undefined, floor = COLLECTION_COUNT_MIN_DISPLAY): number | null => {
    const raw = stats && field ? stats[field] : null;
    return raw !== null && raw !== undefined && raw >= floor ? raw : null;
  };

  const internal = DIGITAL_LIBRARY_ITEMS.filter((item) => !item.external);
  const external = DIGITAL_LIBRARY_ITEMS.filter((item) => item.external);
  const books = internal.find((item) => item.labelKey === "eBooks");
  const others = internal.filter((item) => item.labelKey !== "eBooks");
  const booksCount = countOf("books");
  const physicalCount = countOf("physicalCatalogs", PHYSICAL_CATALOG_MIN_DISPLAY);
  const topDepartments = departments.slice(0, BOOKS_TILE_DEPARTMENTS);

  return (
    // A column that fills the band's row: when the goals list beside it is
    // the taller of the two, the 2×2 rows take up the slack, so both columns
    // end on one line instead of the left one stopping short.
    <div className="flex h-full flex-col">
      {heading}

      {/* ── Books — the feature tile ──
          The title is the tile's link, stretched over the whole card with an
          ::after; each department chip is its own link above that layer. No
          anchor is nested in another. */}
      {books && (
        <div className={`relative p-4 sm:p-5 ${CARD}`}>
          <div className="flex items-start gap-4">
            <Plate Icon={books.icon} plate={PLATE.eBooks} size="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <h4 className="font-record text-[18px] font-bold leading-snug text-text-heading">
                <Link
                  href={books.href}
                  aria-label={t("collectionsGridCardLabel", { collection: tNav("eBooks") })}
                  className="rounded-sm transition-colors after:absolute after:inset-0 after:rounded-xl hover:text-brand focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus-ring/50"
                >
                  {tNav("eBooks")}
                </Link>
              </h4>
              <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{tNav(books.descriptionKey)}</p>
            </div>
            {booksCount !== null && (
              <p className="shrink-0 text-right">
                <span data-collection-count="books" className="block font-serif text-[26px] font-semibold leading-none tabular-nums text-text-heading">
                  {formatCount(booksCount, locale)}
                </span>
                <span className="mt-1 block text-[12px] text-text-muted">{t("statEbooks")}</span>
              </p>
            )}
          </div>

          {topDepartments.length > 0 && (
            <ul className="relative z-10 mt-4 flex flex-wrap gap-2" aria-label={t("deptFilterLabel")}>
              {topDepartments.map(({ name, count }) => (
                <li key={name}>
                  <Link
                    href={`/books?dept=${encodeURIComponent(name)}`}
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-3 py-1 text-[12.5px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
                  >
                    {name}
                    {/* A real space, not just the flex gap: without it the
                        accessible name reads "Science256". */}
                    {count >= COLLECTION_COUNT_MIN_DISPLAY && " "}
                    {count >= COLLECTION_COUNT_MIN_DISPLAY && (
                      <span className="tabular-nums text-text-muted">{formatCount(count, locale)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── The other collections — compact rows, 2×2 from sm ── */}
      <ul className="mt-3 grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2">
        {others.map((item) => {
          const count = countOf(COUNT_FIELD[item.labelKey]);
          const label = tNav(item.labelKey);
          return (
            <li key={item.labelKey}>
              <CollectionRow
                href={item.href}
                label={label}
                ariaLabel={t("collectionsGridCardLabel", { collection: label })}
                description={tNav(item.descriptionKey)}
                countText={count !== null ? t("collectionsGridItemCount", { count }) : null}
                countField={COUNT_FIELD[item.labelKey] ?? "books"}
                Icon={item.icon}
                plate={PLATE[item.labelKey]}
              />
            </li>
          );
        })}
        <li>
          <CollectionRow
            href="/catalogs"
            label={tNav("booksInLibrary")}
            ariaLabel={t("collectionsGridCardLabel", { collection: tNav("booksInLibrary") })}
            description={tNav("physicalLibraryDescription")}
            countText={physicalCount !== null ? t("collectionsGridItemCount", { count: physicalCount }) : null}
            countField="physicalCatalogs"
            Icon={Library}
            plate={PLATE.physical}
          />
        </li>
      </ul>

      {/* ── Elsewhere — SVA Library (a partner catalogue) and PTEC's official
          publications (the college website). One line, so nobody reads
          either as a further PTEC collection. The "opens in a new tab" note
          is sr-only text INSIDE each link, part of its accessible name. */}
      {external.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-muted">
          <span>{tNav("digitalLibraryExternalGroup")}:</span>
          {external.map((item, i) => (
            <span key={item.labelKey} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden>·</span>}
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-semibold text-brand underline-offset-2 hover:underline"
              >
                {tNav(item.labelKey)}
                <span aria-hidden> ↗</span>
                <span className="sr-only"> ({t("collectionsGridExternal")})</span>
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
