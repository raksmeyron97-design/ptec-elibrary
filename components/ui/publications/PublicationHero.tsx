import { getTranslations } from "next-intl/server";
import { CalendarDays, ScrollText, Scale, ShieldCheck } from "lucide-react";
import ActionButtons from "@/components/ui/detail/ActionButtons";
import AuthorAffiliationPanel from "@/components/ui/publications/AuthorAffiliationPanel";
import PublicationMetricsRow from "@/components/ui/publications/PublicationMetricsRow";
import { citationYear } from "@/lib/citations";
import type { Publication, PublicationAffiliation, PublicationAuthorship } from "@/lib/publications";

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
}) {
  const t = await getTranslations("publicationDetail");
  return (
    <header className="gradient-top-border fade-rise-in mb-7 overflow-hidden rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-7 md:p-9">
      <div className="flex flex-col gap-6">
        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
                <span className="h-1.5 w-1.5 rounded-full bg-brand/60" />
                {pub.journal_name ?? TYPE_LABELS[pub.article_type] ?? "Article"}
                {pub.journal_name && (
                  <span className="ml-1 rounded-full bg-brand/10 px-2 py-px text-[9.5px] normal-case tracking-normal">
                    {TYPE_LABELS[pub.article_type] ?? pub.article_type}
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/60 dark:text-emerald-400">
                <ShieldCheck className="h-3 w-3" /> {t("openAccess")}
              </span>
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
          {pub.title_km && pub.title_km.trim().toLowerCase() !== pub.title.trim().toLowerCase() && (
            <p className="mt-1.5 font-khmer-serif text-[clamp(16px,2.5vw,22px)] font-semibold leading-snug text-text-muted">
              {pub.title_km}
            </p>
          )}

          {/* Byline with superscript affiliation markers */}
          {authorships.length > 0 ? (
            <p className="mt-4 text-[15px] leading-7 text-text-body sm:text-[16.5px]">
              {authorships.map((a, i) => (
                <span key={a.author.id}>
                  <span className="font-semibold text-text-heading">{a.author.full_name}</span>
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
          <PublicationMetricsRow
            views={(pub.view_count || 0) + 1}
            downloads={pub.download_count || 0}
            referenceCount={pub.references.length}
            year={citationYear(pub)}
            labels={{
              views: t("views"),
              downloads: t("downloads"),
              references: t("sectionReferences"),
              year: t("fieldYear"),
            }}
          />
        </div>
      </div>
    </header>
  );
}
