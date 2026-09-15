import { getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { slugify } from "@/lib/book-utils";
import { secondaryValue } from "@/lib/publications/integrity";
import type { PublicationAuthorship } from "@/lib/publications";
import type { NumberedAffiliation } from "@/lib/publications/article-layout";

/** Above this many affiliations the list folds behind a disclosure. */
const OPEN_AFFILIATIONS = 4;

/**
 * The byline as a list of people, then the institutions their markers point to.
 *
 * Each author is one list item: the name (a link to their profile, resolved
 * exactly as before — stored slug from 0125, name-derived fallback), their
 * affiliation numbers, and the corresponding-author mark. The markers stay
 * OUTSIDE the link, so the link text is the name a reader would search for,
 * not "Set Seng1,2*". Screen readers get the markers as words.
 *
 * Every author is shown — a byline is credit, and "et al." on the work's own
 * page would take it away. With ten or more the list simply wraps.
 */
export default async function ArticleAuthors({
  authorships,
  markerFor,
  affiliations,
  fallbackNames,
}: {
  authorships: PublicationAuthorship[];
  markerFor: Map<string, number>;
  affiliations: NumberedAffiliation[];
  /** Byline for a record with no authorship rows (split by citationNames()). */
  fallbackNames: string[];
}) {
  const t = await getTranslations("publicationDetail");
  const corresponding = authorships.filter((a) => a.is_corresponding);

  if (authorships.length === 0) {
    if (fallbackNames.length === 0) return null;
    return (
      <ul aria-label={t("authorsLabel")} className="mt-5 flex flex-wrap gap-x-1 gap-y-1 text-[16px] leading-7 sm:text-[17px]">
        {fallbackNames.map((name, i) => (
          <li key={`${i}-${name}`} className="font-semibold text-text-heading">
            {name}
            {i < fallbackNames.length - 1 && (
              <span aria-hidden="true" className="px-1.5 font-normal text-text-muted">·</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const affiliationList = (
    <ol aria-label={t("affiliationsLabel")} className="space-y-1 text-[13.5px] leading-6 text-text-muted">
      {affiliations.map(({ marker, affiliation }) => {
        const place = [affiliation.city, affiliation.country].filter(Boolean).join(", ");
        const translated = secondaryValue(affiliation.name, affiliation.name_km);
        return (
          <li key={affiliation.id} className="flex gap-2">
            <span className="w-3 shrink-0 text-right font-semibold tabular-nums text-text-body" aria-hidden="true">
              {marker}
            </span>
            <span className="sr-only">{marker}. </span>
            <span className="min-w-0">
              <span className="text-text-body">{affiliation.name}</span>
              {translated && (
                <span lang="km" className="ml-1.5">
                  ({translated})
                </span>
              )}
              {place && <span>, {place}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="mt-5">
      <ul aria-label={t("authorsLabel")} className="flex flex-wrap gap-y-1 text-[16px] leading-7 sm:text-[17px]">
        {authorships.map((a, i) => {
          const markers = a.affiliation_ids.map((id) => markerFor.get(id)).filter((n): n is number => !!n);
          const name = a.author.full_name.trim();
          return (
            <li key={a.author.id} className="whitespace-nowrap">
              {name ? (
                <Link
                  href={`/authors/${a.author.slug || slugify(a.author.full_name)}`}
                  className="whitespace-normal rounded-sm font-semibold text-text-heading underline decoration-divider decoration-1 underline-offset-[5px] transition-colors hover:text-brand hover:decoration-brand"
                >
                  {name}
                </Link>
              ) : (
                <span className="font-semibold text-text-heading">{a.author.full_name}</span>
              )}
              {markers.length > 0 && (
                <sup className="ml-0.5 text-[11.5px] font-medium text-text-muted">
                  <span className="sr-only"> ({t("affiliationsLabel")} </span>
                  {markers.join(",")}
                  <span className="sr-only">)</span>
                </sup>
              )}
              {a.is_corresponding && (
                <>
                  <sup aria-hidden="true" className="text-[12px] font-bold text-brand">*</sup>
                  <span className="sr-only">, {t("correspondingNote")}</span>
                </>
              )}
              {i < authorships.length - 1 && (
                <span aria-hidden="true" className="px-2 text-text-muted">·</span>
              )}
            </li>
          );
        })}
      </ul>

      {(affiliations.length > 0 || corresponding.length > 0) && (
        <div className="mt-3 max-w-[80ch]">
          {affiliations.length > OPEN_AFFILIATIONS ? (
            <details className="group">
              <summary className="inline-flex min-h-9 cursor-pointer select-none list-none items-center gap-1 text-[13.5px] font-semibold text-text-body hover:text-brand [&::-webkit-details-marker]:hidden">
                {t("affiliationsLabel")} ({affiliations.length})
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <div className="mt-2">{affiliationList}</div>
            </details>
          ) : (
            affiliations.length > 0 && affiliationList
          )}
          {corresponding.length > 0 && (
            <p className="mt-1.5 flex gap-2 text-[13px] leading-6 text-text-muted">
              <span aria-hidden="true" className="w-3 shrink-0 text-right font-bold text-brand">*</span>
              <span>
                {t("correspondingNote")}: {corresponding.map((a) => a.author.full_name).join(", ")}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
