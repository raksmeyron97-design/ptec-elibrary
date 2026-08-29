import type { AuthorStats } from "@/lib/authors/types";
import { publicationSpan } from "@/lib/authors/stats";

/**
 * The profile's statistics strip.
 *
 * Only figures the library can actually observe: how many works it holds, the
 * span they cover, and how many kinds of work they are. There is deliberately
 * no citation count, no h-index and no "profile views" — a repository that
 * shows a number it cannot source is a repository whose other numbers you stop
 * believing.
 *
 * Each figure also earns its place individually:
 *   * the span is hidden when nothing is dated, and collapses to a single year
 *     rather than reading "2026–2026" (publicationSpan);
 *   * the type count is hidden at 1, where "1 type of work" is a sentence
 *     about the layout rather than about the author.
 */
export default function AuthorStatsStrip({
  stats,
  labels,
}: {
  stats: AuthorStats;
  labels: { works: string; span: string; types: string };
}) {
  const span = publicationSpan(stats);

  const items = [
    { key: "works", value: String(stats.workCount), label: labels.works },
    ...(span ? [{ key: "span", value: span, label: labels.span }] : []),
    ...(stats.typeCount > 1
      ? [{ key: "types", value: String(stats.typeCount), label: labels.types }]
      : []),
  ];

  if (stats.workCount === 0) return null;

  return (
    <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4 border-t border-divider pt-5">
      {items.map((item) => (
        // A <dl> group is <dt> then <dd>; the figure reads above its label, so
        // the visual order is flipped in CSS rather than in the markup.
        <div key={item.key} className="flex flex-col-reverse">
          <dt className="mt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-text-muted">
            {item.label}
          </dt>
          <dd className="text-[22px] font-bold leading-none tracking-tight text-text-heading tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
