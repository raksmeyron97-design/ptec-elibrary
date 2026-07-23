import { getTranslations } from "next-intl/server";
import { getThesisById } from "@/app/actions/theses";
import ThesisForm, { type ThesisInitial } from "@/components/admin/theses/form/ThesisForm";
import DownloadAccessCard from "@/components/admin/theses/DownloadAccessCard";
import { normalizeStatus } from "@/lib/admin/theses-shared";
import type { SupplementaryFile } from "@/lib/admin/thesis-file-validation";
import { createServiceClient } from "@/lib/supabase/server";
import { getThesisRank } from "@/lib/theses/download-permission";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
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
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/theses"
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-text-muted hover:text-text-heading"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <p className="text-text-muted text-sm">{t("editSubtitle")}</p>
      </div>

      <DownloadAccessCard
        thesisId={report.id}
        isPublished={report.is_published === true && (report.status == null || report.status === "published")}
        downloadCount={report.download_count ?? 0}
        rank={rank}
        currentOverride={currentOverride}
        reason={report.download_override_reason ?? null}
        updatedAt={report.download_override_updated_at ?? null}
        updatedByName={updatedByName}
      />

      <ThesisForm initial={initial} institution={(await getOrgIdentity()).institutionName} />
    </div>
  );
}
