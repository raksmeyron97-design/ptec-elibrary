import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { Badge } from "@/components/ui/core/Badge";
import type { Publication } from "@/lib/publications";
import { citationYear } from "@/lib/citations";

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  review: "Review",
  account: "Account",
  editorial: "Editorial",
};

export default function PublicationCard({ publication }: { publication: Publication }) {
  const formatCount = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : String(n || 0);

  const downloads = publication.download_count || 0;
  const views = publication.view_count || 0;
  const keywords = (publication.keywords ?? []).slice(0, 2);
  const year = citationYear(publication);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-bg-surface border border-divider shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:border-brand/30">
      {/* Gold top-rule accent on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
      />

      <Link href={`/publications/${publication.slug}`} className="flex h-full flex-col">
        {/* ── Graphical abstract — the dominant visual element ── */}
        <div className="relative mx-3 mt-3 overflow-hidden rounded-xl sm:mx-3.5 sm:mt-3.5 border border-divider/60 shadow-sm ring-1 ring-black/[0.03]">
          <div className="relative aspect-[3/4] w-full bg-paper">
            {publication.cover_url ? (
              <Image
                src={publication.cover_url}
                alt={publication.title}
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand/5 to-brand/10 p-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-brand/25"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v8a2 2 0 01-2 2z" />
                  <path d="M15 4v6h6" />
                </svg>
                <p className="text-center font-khmer-serif text-[12px] font-bold leading-snug text-brand/60 line-clamp-4">
                  {publication.title}
                </p>
              </div>
            )}

            {/* Year badge — top right */}
            {year && (
              <span className="absolute right-2 top-2 z-[4] rounded-md bg-bg-surface/90 px-2 py-[3px] text-[9px] font-bold uppercase tracking-wider text-text-muted shadow-sm backdrop-blur-sm border border-divider/50">
                {year}
              </span>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3.5 sm:px-4 sm:pb-4 min-w-0">
          {/* Article-type pill */}
          <Badge variant="brand" className="mb-2 self-start !text-[9px] !px-2 !py-0.5 uppercase tracking-wide">
            {TYPE_LABELS[publication.article_type] ?? publication.article_type}
          </Badge>

          {/* Title — emphasized as the primary identifier */}
          <h3 className="text-[13.5px] font-khmer-serif font-bold leading-snug tracking-tight text-text-heading line-clamp-2 transition-colors group-hover:text-brand sm:text-[15px]">
            {publication.title}
          </h3>
          {publication.title_km && (
            <p className="mt-1 font-khmer-serif text-[11.5px] leading-snug text-text-muted line-clamp-1 sm:text-[12.5px]">
              {publication.title_km}
            </p>
          )}

          {/* Authors — second-most prominent field */}
          {publication.author_names && (
            <p className="mt-1.5 text-[11.5px] text-text-body line-clamp-1 sm:text-[12.5px] font-semibold">
              {publication.author_names}
            </p>
          )}

          {/* Journal */}
          {publication.journal_name && (
            <p className="mt-1 text-[10.5px] italic text-text-muted line-clamp-1">
              {publication.journal_name}
            </p>
          )}

          {/* Keywords */}
          {keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded bg-bg-app px-1.5 py-0.5 text-[9px] font-medium text-text-muted line-clamp-1"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="mt-auto pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {downloads > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3v13m0 0-4-4m4 4 4-4" />
                      <path d="M4 20h16" />
                    </svg>
                    {formatCount(downloads)}
                  </span>
                )}

                {views > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {formatCount(views)}
                  </span>
                )}
              </div>

              <span className="inline-flex items-center gap-0.5 rounded-full border border-brand/15 bg-brand/5 px-3 py-1.5 text-[11px] font-bold text-brand transition-colors group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast sm:px-2.5 sm:py-1 sm:text-[10px]">
                View
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
