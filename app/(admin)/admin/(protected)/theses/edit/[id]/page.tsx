import { getTranslations } from "next-intl/server";
import { getThesisById } from "@/app/actions/theses";
import ThesisForm, { type ThesisInitial } from "@/components/admin/theses/form/ThesisForm";
import DownloadAccessCard from "@/components/admin/theses/DownloadAccessCard";
import { normalizeStatus, STATUS_LABELS, STATUS_TONES } from "@/lib/admin/theses-shared";
import type { SupplementaryFile } from "@/lib/admin/thesis-file-validation";
import { createServiceClient } from "@/lib/supabase/server";
import { getThesisRank } from "@/lib/theses/download-permission";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin/kit";
import { FormShell, BTN_SECONDARY } from "@/components/admin/kit/form";
import { getOrgIdentity } from "@/lib/system-settings/config";

export default async function EditThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const { data: report, error } = await getThesisById(resolvedParams.id);

  if (error || !report) {
    notFound();
  }

  // Download Access — current global rank + who last set the override.
  const service = createServiceClient();
  let rank: number | null = null;
  try {
    rank = await getThesisRank(service, report.id);
  } catch { /* non-fatal */ }
  let updatedByName: string | null = null;
  if (report.download_override_updated_by) {
    const { data: editor } = await service
      .from("profiles")
      .select("full_name")
      .eq("id", report.download_override_updated_by)
      .maybeSingle();
    updatedByName = editor?.full_name ?? null;
  }
  const currentOverride =
    report.download_override === "allow" || report.download_override === "block"
      ? report.download_override
      : "inherit";

  const initial: ThesisInitial = {
    id: report.id,
    title: report.title ?? "",
    slug: report.slug ?? "",
    doi: report.doi ?? null,
    thesisType: report.thesis_type ?? null,
    language: report.language ?? null,
    license: report.license ?? null,
    program: report.program ?? null,
    faculty: report.faculty ?? null,
    subject: report.subject ?? null,
    cohort: report.cohort ?? null,
    academicYear: report.academic_year ?? null,
    authorNames: report.author_names ?? null,
    advisorName: report.advisor_name ?? null,
    coAdvisorName: report.co_advisor_name ?? null,
    publishedAt: report.published_at ?? null,
    defenseDate: report.defense_date ?? null,
    submittedDate: report.submitted_date ?? null,
    abstract: report.abstract ?? null,
    keywords: report.keywords ?? [],
    references: report.references ?? null,
    coverUrl: report.cover_url ?? null,
    coverAltText: report.cover_alt_text ?? null,
    fileUrl: report.file_url ?? null,
    fileSizeKb: report.file_size_kb ?? null,
    supplementaryFiles: (report.supplementary_files ?? []) as SupplementaryFile[],
    status: normalizeStatus(report.status),
    scheduledAt: report.scheduled_at ?? null,
    seoTitle: report.seo_title ?? null,
    seoDescription: report.seo_description ?? null,
    ogImage: report.og_image ?? null,
  };

  const t = await getTranslations("adminThesisForm");
  const isLive = report.is_published === true && (report.status == null || report.status === "published");

  return (
    /*
      The thesis being edited is named in the heading. Previously the page
      opened with a bare "Update details for this thesis" and the Download
      Access card, so an administrator arriving from a list of near-identical
      titles had to scroll into the form to confirm they were on the right
      record.
    */
    <FormShell
      backHref="/admin/theses"
      backLabel={t("backToTheses")}
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="min-w-0">{report.title?.trim() || t("untitledThesis")}</span>
          <StatusBadge tone={STATUS_TONES[normalizeStatus(report.status)]}>
            {STATUS_LABELS[normalizeStatus(report.status)]}
          </StatusBadge>
        </span>
      }
      description={t("editSubtitle")}
      headerActions={
        isLive && report.slug ? (
          <a
            href={`/theses/${report.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={BTN_SECONDARY}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("viewPublicPage")}
            <span className="sr-only"> — {t("opensInNewTab")}</span>
          </a>
        ) : null
      }
      aside={
        /*
          Download Access is a permission on the record, not a field of it — it
          writes through its own action and is unaffected by Save. It used to
          sit above the form, pushing the tabs most of a screen down on the page
          whose first job is editing fields; as a sticky aside it stays
          reachable without competing for that first screen.
        */
        <DownloadAccessCard
          thesisId={report.id}
          isPublished={isLive}
          downloadCount={report.download_count ?? 0}
          rank={rank}
          currentOverride={currentOverride}
          reason={report.download_override_reason ?? null}
          updatedAt={report.download_override_updated_at ?? null}
          updatedByName={updatedByName}
        />
      }
    >
      <ThesisForm initial={initial} institution={(await getOrgIdentity()).institutionName} />
    </FormShell>
  );
}
