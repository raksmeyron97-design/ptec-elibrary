import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { FileText, ShieldCheck } from "lucide-react";
import ActionButtons from "@/components/ui/detail/ActionButtons";
import MetricsPanel from "@/components/ui/detail/MetricsPanel";
import BackToTopButton from "@/components/ui/detail/BackToTopButton";
import CitePublication from "@/components/ui/publications/CitePublication";
import PublicationMetadataCard from "@/components/ui/publications/PublicationMetadataCard";
import type { Publication } from "@/lib/publications";

export default async function PublicationSidebar({
  pub,
  fileHref,
  shareUrl,
  publishedOn,
  year,
}: {
  pub: Publication;
  fileHref: string;
  shareUrl: string;
  publishedOn: string | null;
  year: string | null;
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
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/95 px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide text-emerald-700 shadow-sm backdrop-blur-sm dark:border-emerald-800/40 dark:bg-emerald-950/80 dark:text-emerald-400">
          <ShieldCheck className="h-3 w-3" /> {t("openAccess")}
        </span>
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
      <MetricsPanel
        views={(pub.view_count || 0) + 1}
        downloads={pub.download_count || 0}
        labels={{ views: t("views"), downloads: t("downloads") }}
      />

      {/* Cite this */}
      <div id="cite-panel" className="scroll-mt-20 lg:scroll-mt-32">
        <CitePublication publication={pub} />
      </div>

      {/* Publication information */}
      <PublicationMetadataCard pub={pub} publishedOn={publishedOn} year={year} />

      <BackToTopButton label={t("backToTop")} />
    </aside>
  );
}
