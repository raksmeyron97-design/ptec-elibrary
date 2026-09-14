import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EYEBROW } from "@/components/ui/publications/article/styles";

export type ArticleDetail = { label: string; value: string; mono?: boolean };

/**
 * "Published in": the article's place in its journal, and the record's
 * remaining facts, in one block at the end of the article.
 *
 * It closes the Article → Issue → Journal chain the header opened, without
 * competing with the text: a tinted panel, no border, no shadow. The details
 * list is everything the old "Publication information" rail card carried that
 * the header does not already say — publisher, ISSN, licence, copyright,
 * language, pages — each row present only when the record has the value.
 *
 * An article whose journal has no public page still names its journal, and
 * links the listing filtered to it rather than a page that does not exist.
 */
export default async function ArticleJournalContext({
  journal,
  issue,
  details,
}: {
  journal: { name: string | null; href: string | null; filterHref: string | null };
  issue: { label: string | null; href: string | null; date: string | null };
  details: ArticleDetail[];
}) {
  if (!journal.name && details.length === 0) return null;
  const t = await getTranslations("publicationDetail");
  const button =
    "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 text-[14px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand";

  return (
    <section aria-labelledby="published-in-heading" className="rounded-2xl bg-paper px-5 py-6 sm:px-7 sm:py-7">
      <h2 id="published-in-heading" className={`text-accent-text ${EYEBROW}`}>
        {t("publishedIn")}
      </h2>
      {journal.name && (
        <p className="mt-2 font-khmer-serif text-[20px] font-bold leading-snug text-text-heading sm:text-[22px]">
          {journal.href ? (
            <Link href={journal.href} className="transition-colors hover:text-brand hover:underline">
              {journal.name}
            </Link>
          ) : (
            journal.name
          )}
        </p>
      )}
      {(issue.label || issue.date) && (
        <p className="mt-1 text-[14.5px] text-text-body">
          {issue.label &&
            (issue.href ? (
              <Link href={issue.href} className="font-medium transition-colors hover:text-brand hover:underline">
                {issue.label}
              </Link>
            ) : (
              <span className="font-medium">{issue.label}</span>
            ))}
          {issue.label && issue.date && <span aria-hidden="true" className="text-text-muted"> · </span>}
          {issue.date && <span className="text-text-muted">{issue.date}</span>}
        </p>
      )}

      {(issue.href || journal.href || journal.filterHref) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {issue.href && (
            <Link href={issue.href} className={button}>
              {t("viewIssue")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          {journal.href ? (
            <Link href={journal.href} className={button}>
              {t("viewJournal")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            journal.filterHref &&
            journal.name && (
              <Link href={journal.filterHref} className={button}>
                {t("browseJournal", { journal: journal.name })}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )
          )}
        </div>
      )}

      {details.length > 0 && (
        <>
          <h3 className="sr-only">{t("metadataHeading")}</h3>
          <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-divider pt-5 text-[13.5px] sm:grid-cols-2">
            {details.map((d) => (
              <div key={d.label} className="min-w-0">
                <dt className="text-text-muted">{d.label}</dt>
                <dd className={`mt-0.5 break-words font-medium text-text-heading ${d.mono ? "font-mono" : ""}`}>{d.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
