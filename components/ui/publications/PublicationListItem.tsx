import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { FileText, Fingerprint } from "lucide-react";
import { Badge } from "@/components/ui/core/Badge";
import ResourceMetrics from "@/components/ui/core/ResourceMetrics";
import AccessBadge from "@/components/ui/publications/AccessBadge";
import type { Publication } from "@/lib/publications";
import { citationYear } from "@/lib/citations";
import { academicTextToPlainText } from "@/lib/publications/citations";

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  review: "Review",
  account: "Account",
  editorial: "Editorial",
};

/**
 * A repository row, not a poster.
 *
 * The listing rendered every article as a 3:4 cover card copied from the book
 * grid. On a book the cover IS the identifier; on a journal article it is the
 * issue's cover — often shared by every article in that issue, and often
 * missing — while the fields that actually let a researcher triage a result
 * (authors, journal, volume/issue/pages, year, a line of the abstract) were
 * squeezed to `line-clamp-1` at 10.5px underneath it.
 *
 * This inverts that: the source line is set as a real citation, the abstract
 * gets two lines to sell the paper, and the cover shrinks to a thumbnail that
 * is skipped by assistive tech because the title beside it says the same
 * thing.
 */
export default function PublicationListItem({
  publication,
  labels,
}: {
  publication: Publication;
  labels: { openAccess: string; licensed: string; rightsUnstated: string };
}) {
  const year = citationYear(publication);
  const snippet = academicTextToPlainText(publication.abstract, publication.references);

  // "Journal of Chemical Education · 91(6) · 776–777 · 2014" — assembled from
  // whatever the record actually has, never printed with empty slots.
  const source = [
    publication.journal_name,
    publication.volume
      ? publication.issue_no
        ? `${publication.volume}(${publication.issue_no})`
        : publication.volume
      : null,
    publication.page_start
      ? [publication.page_start, publication.page_end].filter(Boolean).join("–")
      : null,
    year,
  ].filter(Boolean) as string[];

  return (
    <article className="group relative rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm transition-all duration-200 hover:border-brand/30 hover:shadow-md sm:p-5">
      <div className="flex gap-4 sm:gap-5">
        {/* Thumbnail. Decorative: the title is the accessible identifier. */}
        <div aria-hidden="true" className="hidden shrink-0 sm:block sm:w-[72px] md:w-[86px]">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-divider/60 bg-paper">
            {publication.cover_url ? (
              <Image
                src={publication.cover_url}
                alt=""
                fill
                sizes="86px"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/5 to-brand/10">
                <FileText className="h-6 w-6 text-brand/25" strokeWidth={1.5} />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="brand" className="!px-2 !py-0.5 !text-[9px] uppercase tracking-wide">
              {TYPE_LABELS[publication.article_type] ?? publication.article_type}
            </Badge>
            <AccessBadge license={publication.license} labels={labels} />
          </div>

          {/* The whole row is clickable through this one link — a card-wide
              anchor wrapping the metrics and badges would swallow them into a
              single unreadable accessible name. */}
          <h3 className="font-khmer-serif text-[15.5px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand sm:text-[17px]">
            <Link
              href={`/publications/${publication.slug}`}
              prefetch={false}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              {publication.title}
            </Link>
          </h3>
          {publication.title_km && (
            <p lang="km" className="mt-0.5 font-khmer-serif text-[13px] leading-relaxed text-text-muted line-clamp-1">
              {publication.title_km}
            </p>
          )}

          {publication.author_names && (
            <p className="mt-1.5 text-[13px] font-semibold leading-5 text-text-body line-clamp-1">
              {publication.author_names}
            </p>
          )}

          {source.length > 0 && (
            <p className="mt-0.5 text-[12.5px] leading-5 text-text-muted">
              <em className="not-italic first:italic">{source[0]}</em>
              {source.slice(1).map((part) => (
                <span key={part}>
                  <span aria-hidden="true" className="mx-1.5 text-divider">·</span>
                  {part}
                </span>
              ))}
            </p>
          )}

          {snippet && (
            <p className="mt-2 text-[13px] leading-[1.65] text-text-muted line-clamp-2">
              {snippet}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <ResourceMetrics
              views={publication.view_count || 0}
              downloads={publication.download_count || 0}
              size="xs"
            />
            {publication.doi && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-text-muted">
                <Fingerprint className="h-3 w-3" aria-hidden="true" />
                {publication.doi.replace(/^https?:\/\/doi\.org\//, "")}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
