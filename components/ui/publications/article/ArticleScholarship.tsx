import { getTranslations } from "next-intl/server";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { articlePath } from "@/lib/journals/urls";
import type { RelatedReason, ScholarshipItem } from "@/lib/publications/related";

type Item = ScholarshipItem & { reason?: RelatedReason };

function yearOf(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : String(d.getUTCFullYear());
}

/** One row of a scholarly reading list: the title, then who, where and when. */
function ScholarlyRow({ item, locale, reasonLabel }: { item: Item; locale: string; reasonLabel?: string }) {
  const title = locale === "km" && item.titleKm ? item.titleKm : item.title;
  const byline = item.authors.length > 3 ? `${item.authors.slice(0, 3).join(", ")} et al.` : item.authors.join(", ");
  const meta = [byline || null, item.journal, yearOf(item.date)].filter(Boolean) as string[];
  return (
    <li className="py-4 first:pt-0">
      <Link
        href={articlePath(item.slug)}
        className="font-khmer-serif text-[16px] font-bold leading-snug text-text-heading transition-colors hover:text-brand hover:underline [&:lang(km)]:leading-[1.7]"
      >
        {title}
      </Link>
      {meta.length > 0 && <p className="mt-1 text-[13.5px] leading-6 text-text-muted">{meta.join(" · ")}</p>}
      {reasonLabel && <p className="mt-0.5 text-[12.5px] font-medium text-text-muted">{reasonLabel}</p>}
    </li>
  );
}

function Block({
  id,
  heading,
  action,
  children,
}: {
  id: string;
  heading: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-divider pb-2.5">
        <h3 id={id} className="font-khmer-serif text-[18px] font-bold leading-snug text-text-heading">
          {heading}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * What to read next, in order of scholarly relationship: the same journal,
 * the same author, then related articles, then — lightest — library books.
 *
 * The three article lists arrive already de-duplicated (dedupeScholarship), so
 * an article appears once, under its strongest relationship. They are lists,
 * not cover cards: for articles the title, byline, journal and year are the
 * information, and a grid of generated covers gave the least-related content
 * on the page its heaviest visual weight. Books keep their covers — for books
 * the cover IS recognisable — on a smaller shelf, last.
 */
export default async function ArticleScholarship({
  locale,
  journal,
  author,
  related,
  books,
}: {
  locale: string;
  journal: { name: string | null; href: string | null; items: ScholarshipItem[] };
  author: { name: string; scholarUrl: string; items: ScholarshipItem[] } | null;
  related: (ScholarshipItem & { reason: RelatedReason })[];
  books: React.ReactNode;
}) {
  const t = await getTranslations("publicationDetail");
  const reasonLabel: Record<RelatedReason, string> = {
    journal: t("reasonJournal"),
    keywords: t("reasonKeywords"),
    author: t("reasonAuthor"),
    popular: t("reasonPopular"),
  };
  const moreLink =
    "inline-flex min-h-9 items-center gap-1 text-[13.5px] font-semibold text-brand transition-colors hover:underline";

  const hasJournal = journal.items.length > 0;
  const hasAuthor = !!author && author.items.length > 0;
  const hasRelated = related.length > 0;

  return (
    <div className="space-y-12">
      {hasJournal && (
        <Block
          id="more-from-journal"
          heading={t("moreFromJournal")}
          action={
            journal.href ? (
              <Link href={journal.href} className={moreLink}>
                {t("viewJournal")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null
          }
        >
          <ul className="divide-y divide-divider">
            {journal.items.slice(0, 5).map((item) => (
              <ScholarlyRow key={item.id} item={item} locale={locale} />
            ))}
          </ul>
        </Block>
      )}

      {(hasAuthor || hasRelated) && (
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
          {hasAuthor && author && (
            <Block
              id="more-by-author"
              heading={t("moreByAuthor", { name: author.name })}
              action={
                <a href={author.scholarUrl} target="_blank" rel="noopener noreferrer" className={moreLink}>
                  {t("searchGoogleScholar")}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only"> ({t("opensNewTab")})</span>
                </a>
              }
            >
              <ul className="divide-y divide-divider">
                {author.items.map((item) => (
                  <ScholarlyRow key={item.id} item={item} locale={locale} />
                ))}
              </ul>
            </Block>
          )}
          {hasRelated && (
            <Block id="related-articles" heading={t("relatedPublications")}>
              <ul className="divide-y divide-divider">
                {related.map((item) => (
                  <ScholarlyRow key={item.id} item={item} locale={locale} reasonLabel={reasonLabel[item.reason]} />
                ))}
              </ul>
            </Block>
          )}
        </div>
      )}

      {books}
    </div>
  );
}
