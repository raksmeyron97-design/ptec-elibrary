import { getTranslations } from "next-intl/server";
import { CalendarDays, ScrollText, Scale } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { slugify } from "@/lib/book-utils";
import ActionButtons from "@/components/ui/detail/ActionButtons";
import AuthorAffiliationPanel from "@/components/ui/publications/AuthorAffiliationPanel";
import PublicationMetricsRow from "@/components/ui/publications/PublicationMetricsRow";
import AccessBadge from "@/components/ui/publications/AccessBadge";
import type { Publication, PublicationAffiliation, PublicationAuthorship } from "@/lib/publications";
import { secondaryValue, type PublicationMetrics } from "@/lib/publications/integrity";

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  review: "Review",
  account: "Account",
  editorial: "Editorial",
};

function MetaChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-paper px-2.5 py-1.5 text-[12.5px] font-medium text-text-body">
      <span className="text-text-muted">{icon}</span>
      {children}
    </span>
  );
}

export default async function PublicationHero({
  pub,
  authorships,
  markerFor,
  orderedAffiliations,
  correspondingAuthors,
  citationLine,
  publishedOn,
  fileHref,
  shareUrl,
  metrics,
}: {
  pub: Publication;
  authorships: PublicationAuthorship[];
  markerFor: Map<string, number>;
  orderedAffiliations: { marker: number; affiliation: PublicationAffiliation }[];
  correspondingAuthors: PublicationAuthorship[];
  citationLine: string;
  publishedOn: string | null;
  fileHref: string;
  shareUrl: string;
  metrics: PublicationMetrics;
}) {
  const t = await getTranslations("publicationDetail");

  // The journal is the article's home shelf, so the badge is a filter link
  // into the listing rather than inert text. Falls back to a plain span when
  // the record has no journal — there is nothing to browse to.
  const journalHref = pub.journal_name
    ? `/publications?journal=${encodeURIComponent(pub.journal_name)}`
    : null;
  const badgeClass =
    "inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand";
  const badgeInner = (
    <>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand/60" />
      {pub.journal_name ?? TYPE_LABELS[pub.article_type] ?? "Article"}
      {pub.journal_name && (
        <span className="ml-1 rounded-full bg-brand/10 px-2 py-px text-[9.5px] normal-case tracking-normal">
          {TYPE_LABELS[pub.article_type] ?? pub.article_type}
        </span>
      )}
    </>
  );

  return (
    <header className="gradient-top-border fade-rise-in mb-7 rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-7 md:p-9">
      <div className="flex flex-col gap-6">
        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {journalHref ? (
                <Link
                  href={journalHref}
                  aria-label={t("browseJournal", { journal: pub.journal_name as string })}
                  className={`${badgeClass} cursor-pointer transition-colors duration-150 hover:border-brand/40 hover:bg-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50`}
                >
                  {badgeInner}
                </Link>
              ) : (
                <span className={badgeClass}>{badgeInner}</span>
              )}
              {/* Derived from the record's licence — never asserted by default. */}
              <AccessBadge
                license={pub.license}
                labels={{
                  openAccess: t("openAccess"),
                  licensed: t("accessLicensed"),
                  rightsUnstated: t("accessRightsUnstated"),
                }}
              />
            </div>
            {pub.doi && (
              <a
                href={pub.doi.startsWith("http") ? pub.doi : `https://doi.org/${pub.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-mono text-[11.5px] text-text-muted transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                DOI: {pub.doi.replace(/^https?:\/\/doi\.org\//, "")}
              </a>
            )}
          </div>

          <h1 className="mt-3 font-khmer-serif text-[clamp(24px,4vw,36px)] font-bold leading-[1.28] text-text-heading">
            {pub.title}
          </h1>
          {/* A sibling, never a second <h1>: one heading per document, and
              lang="km" makes a screen reader switch voice instead of reading
              Khmer with an English engine. */}
          {secondaryValue(pub.title, pub.title_km) && (
            <p
              lang="km"
              className="mt-1.5 font-khmer-serif text-[clamp(16px,2.5vw,22px)] font-semibold leading-[1.9] text-text-muted"
            >
              {secondaryValue(pub.title, pub.title_km)}
            </p>
          )}

          {/* Byline with superscript affiliation markers */}
          {authorships.length > 0 ? (
            <p className="mt-4 text-[15px] leading-7 text-text-body sm:text-[16.5px]">
              {authorships.map((a, i) => (
                <span key={a.author.id}>
                  {/* The name links to the author's own page; the superscript
                      markers stay OUTSIDE the link, so the anchor text is the
                      name a reader would search for and not "Sok Dara1,2*". */}
                  {a.author.full_name.trim() ? (
                    <Link
                      href={`/authors/${slugify(a.author.full_name)}`}
                      className="rounded-sm font-semibold text-text-heading underline-offset-4 transition-colors duration-150 hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                    >
                      {a.author.full_name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-text-heading">{a.author.full_name}</span>
                  )}
                  {a.affiliation_ids.length > 0 && (
                    <sup className="ml-0.5 text-[11px] text-text-muted">
                      {a.affiliation_ids.map((id) => markerFor.get(id)).filter(Boolean).join(",")}
                    </sup>
                  )}
                  {a.is_corresponding && <sup className="text-[11px] text-brand">*</sup>}
                  {i < authorships.length - 1 && <span className="text-text-muted">, </span>}
                </span>
              ))}
            </p>
          ) : pub.author_names ? (
            <p className="mt-4 text-[15px] text-text-body sm:text-[16.5px]">
              <span className="font-semibold text-text-heading">{pub.author_names}</span>
            </p>
          ) : null}

          <AuthorAffiliationPanel
            orderedAffiliations={orderedAffiliations}
            correspondingAuthors={correspondingAuthors}
          />

          {/* Citation line */}
          {citationLine && (
            <p className="mt-4 text-[13.5px] text-text-muted">
              <span className="font-semibold text-text-body">{t("citeThis")} </span>
              <em>{citationLine}</em>
            </p>
          )}

          {/* Meta chips */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {publishedOn && <MetaChip icon={<CalendarDays className="h-3.5 w-3.5" />}>{publishedOn}</MetaChip>}
            {pub.license && <MetaChip icon={<Scale className="h-3.5 w-3.5" />}>{pub.license}</MetaChip>}
            {pub.language && (
              <MetaChip icon={<ScrollText className="h-3.5 w-3.5" />}>
                {pub.language === "km" ? "ភាសាខ្មែរ" : "English"}
              </MetaChip>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6">
            <ActionButtons
              id={pub.id}
              contentType="publication"
              title={pub.title}
              fileHref={fileHref}
              hasFile={!!pub.pdf_url}
              shareUrl={shareUrl}
              variant="full"
              labels={{
                download: t("downloadPdf"),
                pdfUnavailable: t("pdfUnavailable"),
                previewPdf: t("previewPdf"),
                bookmarkSaved: t("bookmarkSaved"),
                bookmarkUnsaved: t("bookmarkUnsaved"),
                share: t("share"),
                copyLink: t("copyLink"),
                exportCitation: t("exportCitation"),
              }}
            />
          </div>

          {/* Metrics strip */}
          {/* One derivation, shared with the sidebar rail — the two blocks
              read the same object and cannot disagree. */}
          <PublicationMetricsRow
            metrics={metrics}
            labels={{
              views: t("views"),
              downloads: t("downloads"),
              references: t("sectionReferences"),
              year: t("fieldYear"),
              srViews: t("srViews", { count: metrics.views ?? 0 }),
              srDownloads: t("srDownloads", { count: metrics.downloads ?? 0 }),
              srReferences: t("srReferences", { count: metrics.referenceCount ?? 0 }),
            }}
          />
        </div>
      </div>
    </header>
  );
}
