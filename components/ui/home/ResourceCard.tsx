// components/ui/home/ResourceCard.tsx
//
// The homepage's ONE card. Both remaining grids — "Featured from the
// collection" and "Just added" — render this, in place of the five
// near-identical card implementations the page used to carry (a book card, a
// publication card, an editor's-pick card, a recent-item card and a ranked
// thesis row, each with its own cover handling, truncation and metadata rules).
//
// Design contracts, all of which existed somewhere before and are now in one
// place:
//
//   • Fixed 3:4 cover box with a skeleton, so a grid never reflows as covers
//     arrive. This page measured CLS 0.00 before the refactor and must keep it.
//   • The cover is DECORATIVE: alt="" and aria-hidden, because the title is
//     visible text inside the same link. An alt repeating the title makes the
//     link announce the book twice.
//   • At most two metadata items under the title (author, then one of
//     department / journal / cohort). More than that and Khmer titles at 360px
//     push the card past its neighbours.
//   • Reader-activity counts are suppressed below MIN_VISIBLE_ACTIVITY. On a
//     young collection "4 views" is anti-proof; showing nothing is neutral,
//     and the figure appears on its own once it means something.
//   • Titles clamp to two lines with a `title` attribute carrying the full
//     string, because Khmer has no inter-word spaces and truncates mid-phrase.
import { Link } from "@/i18n/navigation";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import ResourceMetrics from "@/components/ui/core/ResourceMetrics";
import { hrefOf, type HomeResourceItem } from "@/lib/home/payload";

/**
 * Reader-activity floor. Below this, a count says "nobody has read this" more
 * loudly than it says "this is worth reading", so it is omitted rather than
 * advertised. 25 is a deliberate round number: the busiest items in the
 * collection are in the low hundreds, so the threshold separates the tail from
 * the head instead of splitting it arbitrarily.
 */
export const MIN_VISIBLE_ACTIVITY = 25;

/** Tailwind for each type's badge — the same palette search results use, so a
 *  thesis looks like a thesis wherever a reader meets one. */
const BADGE: Record<HomeResourceItem["type"], string> = {
  book: "bg-blue-500/15 text-blue-700 border-blue-500/25 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/25",
  thesis:
    "bg-green-600/15 text-green-800 border-green-600/25 dark:bg-green-400/10 dark:text-green-300 dark:border-green-400/25",
  publication:
    "bg-cyan-600/15 text-cyan-800 border-cyan-500/25 dark:bg-cyan-400/10 dark:text-cyan-300 dark:border-cyan-400/25",
  post: "bg-amber-500/15 text-amber-800 border-amber-500/25 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/25",
  path: "bg-violet-500/15 text-violet-800 border-violet-500/25 dark:bg-violet-400/10 dark:text-violet-300 dark:border-violet-400/25",
};

export type ResourceCardVariant = "featured" | "compact";

export default function ResourceCard({
  item,
  typeLabel,
  variant = "featured",
  footnote,
  sizes,
  priority = false,
}: {
  item: HomeResourceItem;
  /** Localised name of the resource type, resolved by the calling section. */
  typeLabel: string;
  variant?: ResourceCardVariant;
  /** Optional third line, e.g. "Added 3 Aug 2026". Replaces the metrics row. */
  footnote?: string;
  /** Responsive `sizes` for the cover — set by the grid that owns the columns. */
  sizes: string;
  /** Only the first row of the first grid should be eager. */
  priority?: boolean;
}) {
  const activity = item.views + item.downloads;
  const showMetrics = !footnote && activity >= MIN_VISIBLE_ACTIVITY;
  const compact = variant === "compact";

  return (
    <article className="h-full">
      <Link
        href={hrefOf(item)}
        // prefetch={false}: a grid of cards otherwise fires one RSC prefetch
        // per card on viewport entry — a request storm for a page whose whole
        // point is to be light.
        prefetch={false}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-paper transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_12px_36px_-12px_rgba(11,21,53,0.25)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {/* Fixed-ratio box: the skeleton and the generated fallback occupy
            exactly the space the real cover will, so nothing shifts. */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-bg-surface">
          <SmartBookCover
            coverUrl={item.coverUrl}
            title={item.title}
            author={item.author}
            category={item.meta}
            seed={item.slug}
            variant="card"
            alt=""
            sizes={sizes}
            priority={priority}
            imgClassName="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
          <span
            className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10.5px] font-bold backdrop-blur-sm ${BADGE[item.type]}`}
          >
            {typeLabel}
          </span>
        </div>

        <div className={`flex flex-1 flex-col ${compact ? "p-3.5" : "p-4"}`}>
          <h3
            // `title` is the overflow escape hatch: Khmer has no inter-word
            // spaces, so a two-line clamp regularly cuts mid-phrase and the
            // full string has to remain reachable.
            title={item.title}
            className={`font-khmer-serif font-bold leading-[1.5] text-text-heading line-clamp-2 transition-colors group-hover:text-brand ${
              compact ? "text-[14px]" : "text-[14.5px] sm:text-[15px]"
            }`}
          >
            {item.title}
          </h3>

          {/* At most two metadata items, author first. */}
          {item.author && (
            <p className="mt-1 text-[12.5px] text-text-muted line-clamp-1" title={item.author}>
              {item.author}
            </p>
          )}
          {!compact && item.meta && (
            <p className="mt-0.5 text-[12px] text-text-muted line-clamp-1">{item.meta}</p>
          )}

          <div className="mt-auto pt-2.5">
            {footnote ? (
              <p className="text-[11.5px] font-medium text-text-muted">{footnote}</p>
            ) : showMetrics ? (
              <ResourceMetrics views={item.views} downloads={item.downloads} size="xs" />
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
