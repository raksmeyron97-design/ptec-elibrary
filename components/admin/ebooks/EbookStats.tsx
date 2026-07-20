import {
  BookOpen,
  CheckCircle2,
  PenLine,
  ImageOff,
  FileX2,
  Download,
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import StatCard from "@/components/admin/dashboard/StatCard";
import { formatFileSize, type EbooksSummary } from "@/lib/admin/ebooks-shared";

/**
 * 8 KPI cards for the Manage E-books page. Reuses the dashboard StatCard —
 * every card that maps to a filter deep-links straight into it.
 */
export default function EbookStats({ summary }: { summary: EbooksSummary }) {
  const t = useTranslations("adminEbooks.stats");
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      <StatCard
        title={t("total")}
        value={summary.total}
        description={summary.archived > 0 ? t("archived", { count: summary.archived }) : undefined}
        icon={BookOpen}
        href="/admin/manage"
        tone="blue"
      />
      <StatCard
        title={t("live")}
        value={summary.live}
        description={summary.pendingReview > 0 ? t("awaitingReview", { count: summary.pendingReview }) : undefined}
        icon={CheckCircle2}
        href="/admin/manage?status=published"
        tone="green"
      />
      <StatCard title={t("drafts")} value={summary.drafts} icon={PenLine} href="/admin/manage?status=draft" tone="gray" />
      <StatCard
        title={t("missingCovers")}
        value={summary.missingCovers}
        icon={ImageOff}
        href="/admin/manage?coverStatus=missing_cover"
        tone="orange"
      />
      <StatCard
        title={t("missingPdfs")}
        value={summary.missingPdfs}
        description={summary.brokenFiles > 0 ? t("brokenLinks", { count: summary.brokenFiles }) : undefined}
        icon={FileX2}
        href="/admin/manage?fileStatus=missing_pdf"
        tone="red"
      />
      <StatCard title={t("downloads")} value={summary.totalDownloads.toLocaleString()} icon={Download} tone="cyan" />
      <StatCard title={t("storage")} value={formatFileSize(summary.storageKb)} icon={HardDrive} tone="purple" />
      <StatCard
        title={t("weakMetadata")}
        value={summary.missingMetadata}
        icon={AlertTriangle}
        href="/admin/manage?quality=incomplete"
        tone="gold"
      />
    </div>
  );
}
