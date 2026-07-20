import { FileText, CheckCircle2, PenLine, Clock, Eye, Download, AlertTriangle, FileWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import StatCard from "@/components/admin/dashboard/StatCard";
import type { ThesesSummary } from "@/lib/admin/theses-shared";

/**
 * 8 KPI cards for the Manage Theses page (spec section 1). Reuses the
 * existing dashboard StatCard rather than a bespoke ThesisStatCard — its
 * props (title/value/description/icon/href/tone) already match.
 */
export default function ThesisStats({ summary }: { summary: ThesesSummary }) {
  const t = useTranslations("adminTheses.stats");
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
      <StatCard title={t("total")} value={summary.total} icon={FileText} href="/admin/theses" tone="blue" />
      <StatCard title={t("published")} value={summary.published} icon={CheckCircle2} href="/admin/theses?status=published" tone="green" />
      <StatCard title={t("drafts")} value={summary.drafts} icon={PenLine} href="/admin/theses?status=draft" tone="gray" />
      <StatCard title={t("pendingReview")} value={summary.pendingReview} icon={Clock} href="/admin/theses?status=pending_review" tone="orange" />
      <StatCard title={t("views")} value={summary.totalViews.toLocaleString()} icon={Eye} tone="purple" />
      <StatCard title={t("downloads")} value={summary.totalDownloads.toLocaleString()} icon={Download} tone="cyan" />
      <StatCard
        title={t("missingMetadata")}
        value={summary.missingMetadata}
        icon={AlertTriangle}
        href="/admin/theses?metadataQuality=incomplete"
        tone="red"
      />
      <StatCard
        title={t("missingFiles")}
        value={summary.missingFiles}
        icon={FileWarning}
        href="/admin/theses?fileStatus=missing_pdf"
        tone="red"
      />
    </div>
  );
}
