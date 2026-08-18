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
// Count tiles whose value is 0 are dropped rather than shown: a proud "0" is
// worse than one fewer tile, and an empty category will fill in on its own as
// the collection grows.
import { BookOpen, Library, Landmark } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { getCollectionStats } from "@/lib/collection-stats";
import { FOUNDING_YEAR } from "@/lib/about/content";
import AnimatedStat from "./AnimatedStat";

type Tile = {
  key: string;
  value: number;
  label: string;
  Icon: typeof BookOpen;
  /** Icon plate colours — one per tile so the row reads as three distinct facts. */
  plate: string;
  /** Years must never count up from 0; only quantities animate. */
  animate: boolean;
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
      Icon: BookOpen,
      plate: "bg-brand/10 text-brand",
      animate: true,
    },
    {
      key: "physical",
      value: stats.physicalCatalogs,
      label: t("trustPhysicalLabel"),
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
  ].filter((tile) => tile.animate === false || tile.value > 0);

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="trustbar-title">
      <h2 id="trustbar-title" className="sr-only">
        {t("trustTitle")}
      </h2>
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:py-8 md:px-12">
        {/* A plain list, not a <dl> — same call as PublicationMetricsRow.
            A description list may only directly contain dt/dd (or a div
            grouping exactly those), but each tile needs an icon plate beside a
            number-and-label stack; that nesting made axe fire definition-list
            AND dlitem (both serious) on the live homepage and cost the
            Lighthouse a11y gate. The sr-only <dt> also duplicated the visible
            label, so every figure was announced twice. */}
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {tiles.map(({ key, value, label, Icon, plate, animate }) => (
            <li key={key} className="flex items-center gap-4">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${plate}`}
                aria-hidden
              >
                <Icon className="h-6 w-6" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <p className="text-[28px] font-bold leading-none tracking-tight text-text-heading sm:text-[32px]">
                  {/* Years are printed raw: formatCount() would group them
                      into "2,017". Only quantities get separators. */}
                  {animate ? (
                    <AnimatedStat targetValue={value} locale={locale} />
                  ) : (
                    String(value)
                  )}
                </p>
                <p className="mt-1.5 text-[13.5px] font-medium text-text-muted">{label}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
