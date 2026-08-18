// components/ui/home/HeroStatStrip.tsx
//
// The homepage's ONLY statistics surface.
//
// It replaces two separate blocks that sat six sections apart and disagreed
// with each other: a "PTEC Library at a glance" band (digital resources /
// physical books / serving since) and a "PTEC Library in numbers" list inside
// the closing CTA (114 digital resources / 112 e-books / 1 theses / 1
// publications). They labelled the same underlying figure two different ways,
// and the second one led with counts of one — which reads as *small* rather
// than as free and growing.
//
// What is shown, and why only this:
//
//   • Total digital resources — the one figure that answers "how much is here".
//   • Subjects — the count of the taxonomy the reader can click in section 4,
//     so the number and the grid can never disagree.
//   • Serving PTEC since {year} — provenance, which needs no volume to land.
//
// Deliberately NOT here: the physical catalogue count, which belongs to the
// "visit us" section where a reader can act on it, and the per-type breakdown,
// which belongs on /theses and /publications where a count of one is context
// rather than a headline.
//
// Every figure comes from getCollectionStats() via lib/home/payload.ts. When
// stats are unavailable the whole strip is omitted — never a 0, never a stale
// number.
import { FOUNDING_YEAR } from "@/lib/about/content";
import type { HomeStats } from "@/lib/home/payload";
import AnimatedStat from "./AnimatedStat";

export default function HeroStatStrip({
  stats,
  locale,
  resourcesLabel,
  subjectsLabel,
  sinceLabel,
}: {
  stats: HomeStats | null;
  locale: string;
  resourcesLabel: string;
  subjectsLabel: string;
  /** Already interpolated with the year — plurals and word order vary by locale. */
  sinceLabel: string;
}) {
  if (!stats) return null;

  const figures: { key: string; value: number; label: string; animate: boolean }[] = [
    { key: "resources", value: stats.digitalResources, label: resourcesLabel, animate: true },
    { key: "subjects", value: stats.subjects, label: subjectsLabel, animate: true },
    // A year must never count up from zero, and must never be group-separated
    // into "2,017" — so it is printed raw, outside AnimatedStat.
    { key: "since", value: FOUNDING_YEAR, label: sinceLabel, animate: false },
  ].filter((f) => f.animate === false || f.value > 0);

  return (
    <dl className="mt-6 flex flex-wrap items-start gap-x-8 gap-y-4 border-t border-white/12 pt-5">
      {figures.map(({ key, value, label, animate }) => (
        // Each number is the <dd> for its own <dt>. That grouping is what keeps
        // a screen reader — or a copy/paste — from running two figures
        // together, which is how "110+115 Digital resources" happened here once.
        <div key={key} data-stat={key} className="min-w-[84px]">
          <dd className="text-[24px] font-bold leading-none tabular-nums text-white sm:text-[26px]">
            {animate ? <AnimatedStat targetValue={value} locale={locale} /> : String(value)}
          </dd>
          <dt className="mt-1.5 text-[12px] font-medium text-blue-100/70">{label}</dt>
        </div>
      ))}
    </dl>
  );
}
