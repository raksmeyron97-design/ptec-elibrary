// components/ui/home/TrustBar.tsx
// A thin band of verifiable figures directly under the hero.
//
// Every number here is real and comes from one place: getCollectionStats(),
// the single source for public counts (lib/collection-stats.ts), plus
// FOUNDING_YEAR from the sourced About content. Nothing is estimated,
// rounded up, or invented — a "monthly readers" figure was specified for this
// band and left out because no such metric exists in the stats view, and the
// founding year is 2017 per lib/about/content.ts, not any earlier date.
//
// Count tiles are dropped below a per-tile floor rather than shown: a proud
// "0" is worse than one fewer tile, and a thin category fills in on its own as
// the collection grows. The floor is `minimum` on the tile, so the number the
// band RENDERS and the number the rule TESTS are the same field of the same
// getCollectionStats() read — there is no second query and no constant that
// can drift from the figure beside it.
//
// `physicalCatalogs` carries a floor of PHYSICAL_CATALOG_MIN_DISPLAY (25,
// declared below) because the physical catalogue is barely catalogued yet:
// production held SIX active records on 2026-09-17, under a label that reads
// "Books in the physical library", in a band whose whole job is to make the
// collection's size credible. Six is true and it undersells the room.
//
// This is a DISPLAY band-aid over a data gap and must not become permanent —
// docs/DEFERRED.md tracks populating the catalogue, after which the tile
// returns on its own with no code change. It is deliberately not a rule in
// getCollectionStats(): suppressing there would hide the figure from every
// consumer, including /catalogs, which is the physical catalogue's own page
// and must always state its real size.
import { BookOpen, Library, Landmark } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { getCollectionStats } from "@/lib/collection-stats";
import { FOUNDING_YEAR } from "@/lib/about/content";
import AnimatedStat from "./AnimatedStat";

/**
 * Minimum `physicalCatalogs` count for the physical-library tile to appear.
 *
 * Exported so the test can state the boundary in terms of the shipped value
 * rather than re-typing 25 — a test that hardcodes the number passes after
 * someone edits the constant.
 */
export const PHYSICAL_CATALOG_MIN_DISPLAY = 25;

/**
 * Column tracks per SURVIVING tile, not per breakpoint guess. The old
 * `sm:grid-cols-2 lg:grid-cols-3` was a fixed track count, so the moment a
 * tile dropped out the band rendered an empty third column at lg and an
 * orphan on its own row at sm. Keyed by count, every layout is exactly as
 * wide as the row it has to hold. The 3-tile entry reproduces the previous
 * classes exactly, so a full band is unchanged.
 */
const GRID_COLUMNS: Record<number, string> = {
  1: "grid-cols-1 sm:grid-cols-1 lg:grid-cols-1",
  2: "grid-cols-2 sm:grid-cols-2 lg:grid-cols-2",
  3: "grid-cols-3 sm:grid-cols-2 lg:grid-cols-3",
};

type Tile = {
  key: string;
  value: number;
  label: string;
  Icon: typeof BookOpen;
  /** Icon plate colours — one per tile so the row reads as three distinct facts. */
  plate: string;
  /** Years must never count up from 0; only quantities animate. */
  animate: boolean;
  /** Hidden while `value` is below this. Omitted where the value is not a
   *  quantity — a founding year has no floor to be under. */
  minimum?: number;
};

export default async function TrustBar() {
  const [stats, t, locale] = await Promise.all([
    getCollectionStats(),
    getTranslations("home"),
    getLocale(),
  ]);

  // Stats unavailable (the view errored) — the homepage must still render.
  if (!stats) return null;

  const tiles: Tile[] = [
    {
      key: "digital",
      value: stats.totalDigitalResources,
      label: t("trustDigitalLabel"),
      minimum: 1,
      Icon: BookOpen,
      plate: "bg-brand/10 text-brand",
      animate: true,
    },
    {
      key: "physical",
      value: stats.physicalCatalogs,
      label: t("trustPhysicalLabel"),
      minimum: PHYSICAL_CATALOG_MIN_DISPLAY,
      Icon: Library,
      plate: "bg-accent/12 text-accent-text",
      animate: true,
    },
    {
      key: "since",
      value: FOUNDING_YEAR,
      label: t("trustSinceLabel"),
      Icon: Landmark,
      plate: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
      animate: false,
    },
  ].filter((tile) => tile.minimum === undefined || tile.value >= tile.minimum);

  // One row at every width, as many columns as figures survived the filter.
  // Three stacked figures measured ~230 px on a 390 px phone — most of a
  // screen between the hero and the first goal card — to say three numbers.
  // The `since` tile has no floor, so at least one always survives; the
  // fallback covers a future tile set larger than this map.
  const columns = GRID_COLUMNS[tiles.length] ?? GRID_COLUMNS[3];

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="trustbar-title">
      <h2 id="trustbar-title" className="sr-only">
        {t("trustTitle")}
      </h2>
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:py-8 md:px-12">
        {/* A plain list, not a <dl> — same call as PublicationMetricsRow.
            A description list may only directly contain dt/dd (or a div
            grouping exactly those), but each tile needs an icon plate beside a
            number-and-label stack; that nesting made axe fire definition-list
            AND dlitem (both serious) on the live homepage and cost the
            Lighthouse a11y gate. The sr-only <dt> also duplicated the visible
            label, so every figure was announced twice. */}
        <ul className={`grid ${columns} gap-2 sm:gap-6`}>
          {tiles.map(({ key, value, label, Icon, plate, animate }) => (
            <li key={key} className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${plate}`}
                aria-hidden
              >
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <p className="text-[22px] font-bold leading-none tracking-tight text-text-heading sm:text-[32px]">
                  {/* Years are printed raw: formatCount() would group them
                      into "2,017". Only quantities get separators. */}
                  {animate ? (
                    <AnimatedStat targetValue={value} locale={locale} />
                  ) : (
                    String(value)
                  )}
                </p>
                <p className="mt-1.5 text-[12px] font-medium leading-snug text-text-muted sm:text-[13.5px]">{label}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
