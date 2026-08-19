import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import PublicationCard from "@/components/ui/publications/PublicationCard";
import type { RelatedPublication } from "@/lib/publications/related";

/**
 * Related publications, already fetched and ranked by
 * getRelatedPublications(). Presentational only.
 *
 * Renders nothing when the list is empty — the page falls through to library
 * books under an honest "More from the library" heading instead of ending on
 * "No related publications found yet".
 */
export default async function RelatedPublications({ items }: { items: RelatedPublication[] }) {
  if (items.length === 0) return null;

  const t = await getTranslations("publicationDetail");
  const reasonLabel: Record<string, string> = {
    journal: t("reasonJournal"),
    keywords: t("reasonKeywords"),
    author: t("reasonAuthor"),
    popular: t("reasonPopular"),
  };

  return (
    <div aria-labelledby="related-publications-heading">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span aria-hidden="true" className="h-[3px] w-8 rounded-full bg-gradient-to-r from-brand to-accent" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
              {t("keepReading")}
            </span>
          </div>
          <h2
            id="related-publications-heading"
            className="font-khmer-serif text-[26px] font-bold text-text-heading sm:text-[28px]"
          >
            {t("relatedPublications")}
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">{t("relatedSubtitle")}</p>
        </div>
        <Link
          href="/publications"
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-[13px] font-semibold text-text-body shadow-sm transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("browseAll")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 xl:grid-cols-6">
        {items.map(({ publication, reason }) => (
          <div key={publication.id} className="relative">
            <span className="pointer-events-none absolute left-3 top-3 z-30 rounded-full bg-brand/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-contrast shadow-sm backdrop-blur-sm">
              {reasonLabel[reason]}
            </span>
            <PublicationCard publication={publication} />
          </div>
        ))}
      </div>
    </div>
  );
}
