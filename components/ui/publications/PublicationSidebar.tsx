import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import ActionButtons from "@/components/ui/detail/ActionButtons";
import MetricsPanel from "@/components/ui/detail/MetricsPanel";
import BackToTopButton from "@/components/ui/detail/BackToTopButton";
import CitePublication from "@/components/ui/publications/CitePublication";
import PublicationMetadataCard from "@/components/ui/publications/PublicationMetadataCard";
import type { Publication } from "@/lib/publications";
import type { PublicationMetrics } from "@/lib/publications/integrity";
import AccessBadge from "@/components/ui/publications/AccessBadge";
import SubjectList from "@/components/ui/detail/SubjectList";
import KeywordList from "@/components/ui/detail/KeywordList";

export default async function PublicationSidebar({
  pub,
  fileHref,
  shareUrl,
  publishedOn,
  year,
  metrics,
}: {
  pub: Publication;
  fileHref: string;
  shareUrl: string;
  publishedOn: string | null;
  year: string | null;
  metrics: PublicationMetrics;
}) {
  const t = await getTranslations("publicationDetail");
  return (
    <aside className="space-y-5 lg:sticky lg:top-16 lg:self-start">
      {/* Cover */}
      <div className="group/cover relative mx-auto w-full max-w-[260px] overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-sm">
        <div className="relative aspect-[3/4] w-full">
          {pub.cover_url ? (
            <Image
              src={pub.cover_url}
              alt={pub.title}
              fill
              sizes="(max-width: 768px) 100vw, 260px"
              className="object-cover transition-transform duration-500 group-hover/cover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand/5 to-brand/10">
              <FileText className="h-14 w-14 text-brand/25" strokeWidth={1.5} />
              <span className="text-[11px] font-medium text-brand/30">No Cover</span>
            </div>
          )}
        </div>
        <AccessBadge
          license={pub.license}
          variant="overlay"
          labels={{
            openAccess: t("openAccess"),
            licensed: t("accessLicensed"),
            rightsUnstated: t("accessRightsUnstated"),
          }}
        />
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-text-heading">{t("quickActions")}</h2>
        <ActionButtons
          id={pub.id}
          contentType="publication"
          title={pub.title}
          fileHref={fileHref}
          hasFile={!!pub.pdf_url}
          shareUrl={shareUrl}
          variant="compact"
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

      {/* Metrics */}
      {/* Same derivation object the masthead strip renders. */}
      <MetricsPanel
        views={metrics.views}
        downloads={metrics.downloads}
        labels={{
          views: t("views"),
          downloads: t("downloads"),
          srViews: t("srViews", { count: metrics.views ?? 0 }),
          srDownloads: t("srDownloads", { count: metrics.downloads ?? 0 }),
        }}
      />

      {/* Cite this */}
      <div id="cite-panel" className="scroll-mt-20 lg:scroll-mt-32">
        <CitePublication publication={pub} />
      </div>

      {/* Publication information — the "details" nav anchor points here. */}
      <div id="details" className="scroll-mt-24 lg:scroll-mt-36">
        <PublicationMetadataCard pub={pub} publishedOn={publishedOn} year={year} />
      </div>

      {/* Subjects + keywords: filter links into the listing, not dead text.
          These were previously a standalone "Research Areas & Keywords"
          section that rendered a heading over nothing whenever the record had
          neither. In the rail they simply disappear when empty. */}
      {(pub.subjects.length > 0 || pub.keywords.length > 0) && (
        <div className="space-y-4 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
          <SubjectList
            subjects={pub.subjects}
            basePath="/publications"
            heading={t("subjectsHeading")}
          />
          <KeywordList
            keywords={pub.keywords}
            basePath="/publications"
            heading={t("researchAreasKeywords")}
          />
        </div>
      )}

      <BackToTopButton label={t("backToTop")} />
    </aside>
  );
}
