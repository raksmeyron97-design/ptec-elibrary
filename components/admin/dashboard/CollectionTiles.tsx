import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen, GraduationCap, Layers, Library, Newspaper, Route, type LucideIcon } from "lucide-react";
import type { CollectionCounts } from "@/lib/admin/collection-pulse";
import { numberFormat } from "./formatters";

type TileKey = keyof CollectionCounts;

const TILES: { key: TileKey; icon: LucideIcon; tone: "digital" | "print" | "guided" }[] = [
  { key: "books", icon: BookOpen, tone: "digital" },
  { key: "theses", icon: GraduationCap, tone: "digital" },
  { key: "publications", icon: Newspaper, tone: "digital" },
  { key: "printTitles", icon: Library, tone: "print" },
  { key: "printCopies", icon: Layers, tone: "print" },
  { key: "learningPaths", icon: Route, tone: "guided" },
];

const TONE_CLASS = {
  digital: "",
  print: "dash-tile--print",
  guided: "dash-tile--guided",
} as const;

/**
 * "What the library holds" — six solid tiles, one per shelf.
 *
 * These are STOCK, not traffic: they never follow the date range, and the
 * section says so, because a row of big numbers directly above a row of
 * period numbers is otherwise read as one set. Three surfaces separate the
 * digital collection, the print collection and the guided routes through
 * both; the counts come from the public counting rule (`getCollectionStats`)
 * so a tile can never disagree with the homepage.
 *
 * A tile links to its admin list only when the viewer can open that list —
 * `hrefs` is decided by the caller from the route registry, so no tile points
 * at a 403. A count that could not be read says "Unavailable", never 0.
 */
export default function CollectionTiles({
  counts,
  hrefs,
}: {
  counts: CollectionCounts | null;
  hrefs: Partial<Record<TileKey, string>>;
}) {
  const t = useTranslations("adminDashboard.library.collection");
  const nf = numberFormat(useLocale());

  return (
    <section aria-labelledby="collection-heading">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h2 id="collection-heading" className="dash-eyebrow">
          {t("title")}
        </h2>
        <p className="text-xs leading-4 text-text-muted">{t("hint")}</p>
      </div>

      {counts === null ? (
        <p className="dash-card mt-2.5 px-4 py-5 text-sm text-text-muted">{t("unavailable")}</p>
      ) : (
        /* Sized by the COLUMN, not the window: the admin sidebar can be a
           64px rail or 256px wide, so a viewport breakpoint cannot know how
           much room six tiles have. Three per row (the reference's 2×3)
           until the column fits six tiles of ~180px. */
        <div className="@container mt-2.5">
        <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @xl:gap-4 @6xl:grid-cols-6">
          {TILES.map(({ key, icon: Icon, tone }) => {
            const value = counts[key];
            const href = hrefs[key];
            // Figure beside the icon, label under both: the label gets the
            // tile's full width, which is what "Journal articles" and the
            // Khmer labels need.
            const body = (
              <>
                <span className="flex w-full items-start justify-between gap-3">
                  <span className="dash-tile-ico" aria-hidden="true">
                    <Icon className="h-[17px] w-[17px]" />
                  </span>
                  <span className="dash-tile-value text-end text-[28px] font-extrabold leading-8">
                    {value === null ? (
                      <span className="text-[13px] font-semibold">{t("countUnavailable")}</span>
                    ) : (
                      nf.format(value)
                    )}
                  </span>
                </span>
                <span className="dash-tile-label dash-truncate w-full text-[13px] font-semibold">{t(key)}</span>
              </>
            );
            return (
              <li key={key} className="min-w-0">
                {href ? (
                  <Link href={href} className={`dash-tile ${TONE_CLASS[tone]}`}>
                    {body}
                  </Link>
                ) : (
                  <div className={`dash-tile ${TONE_CLASS[tone]}`}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        </div>
      )}
    </section>
  );
}
