import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { articlePath } from "@/lib/journals/urls";
import { EYEBROW } from "@/components/ui/publications/article/styles";

export type ArticleNeighbour = { slug: string; title: string; title_km: string | null };

/**
 * Previous / next article in the issue's printed order.
 *
 * The neighbours come from `issueNeighbours()` (lib/journals/order.ts) — the
 * same comparator the issue's table of contents is sorted by — so this never
 * invents an order. An article outside a public issue has no neighbours and
 * this renders nothing.
 *
 * `compact` sits beside "Back to issue" at the top: two short links, no
 * landmark. `full` closes the article: a labelled <nav> naming both titles.
 * Only one of them is a landmark, so the page never has two navs with the same
 * accessible name.
 */
export default async function ArticlePrevNext({
  previous,
  next,
  locale,
  variant,
}: {
  previous: ArticleNeighbour | null;
  next: ArticleNeighbour | null;
  locale: string;
  variant: "compact" | "full";
}) {
  if (!previous && !next) return null;
  const t = await getTranslations("publicationDetail");
  const titleOf = (a: ArticleNeighbour) => (locale === "km" && a.title_km ? a.title_km : a.title);

  if (variant === "compact") {
    const link =
      "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-semibold text-text-muted transition-colors hover:bg-paper hover:text-brand";
    return (
      <div className="flex items-center">
        {previous && (
          <Link href={articlePath(previous.slug)} title={titleOf(previous)} className={link}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("previousArticle")}
          </Link>
        )}
        {next && (
          <Link href={articlePath(next.slug)} title={titleOf(next)} className={link}>
            {t("nextArticle")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    );
  }

  const card =
    "group flex min-h-full flex-col gap-1.5 rounded-xl border border-divider px-4 py-3.5 transition-colors hover:border-brand/40 hover:bg-paper";
  return (
    <nav aria-label={t("issueNavLabel")} className="grid gap-3 sm:grid-cols-2">
      {previous && (
        <Link href={articlePath(previous.slug)} className={card}>
          <span className={`inline-flex items-center gap-1.5 text-text-muted ${EYEBROW}`}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("previousArticle")}
          </span>
          <span className="line-clamp-2 font-khmer-serif text-[15.5px] font-bold leading-snug text-text-heading group-hover:text-brand">
            {titleOf(previous)}
          </span>
        </Link>
      )}
      {next && (
        <Link href={articlePath(next.slug)} className={`${card} sm:col-start-2 sm:items-end sm:text-right`}>
          <span className={`inline-flex items-center gap-1.5 text-text-muted ${EYEBROW}`}>
            {t("nextArticle")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="line-clamp-2 font-khmer-serif text-[15.5px] font-bold leading-snug text-text-heading group-hover:text-brand">
            {titleOf(next)}
          </span>
        </Link>
      )}
    </nav>
  );
}
