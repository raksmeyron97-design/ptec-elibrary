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
import StatCard from "@/components/admin/dashboard/StatCard";
import { formatFileSize, type EbooksSummary } from "@/lib/admin/ebooks-shared";

/**
 * 8 KPI cards for the Manage E-books page. Reuses the dashboard StatCard —
 * every card that maps to a filter deep-links straight into it.
 */
export default function EbookStats({ summary }: { summary: EbooksSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      <StatCard
        title="Total E-books"
        value={summary.total}
        description={summary.archived > 0 ? `${summary.archived} archived` : undefined}
        icon={BookOpen}
        href="/admin/manage"
        tone="blue"
      />
      <StatCard
        title="Live"
        value={summary.live}
        description={summary.pendingReview > 0 ? `${summary.pendingReview} awaiting review` : undefined}
        icon={CheckCircle2}
        href="/admin/manage?status=published"
        tone="green"
      />
      <StatCard title="Drafts" value={summary.drafts} icon={PenLine} href="/admin/manage?status=draft" tone="gray" />
      <StatCard
        title="Missing Covers"
        value={summary.missingCovers}
        icon={ImageOff}
        href="/admin/manage?coverStatus=missing_cover"
        tone="orange"
      />
      <StatCard
        title="Missing PDFs"
        value={summary.missingPdfs}
        description={summary.brokenFiles > 0 ? `${summary.brokenFiles} broken link(s)` : undefined}
        icon={FileX2}
        href="/admin/manage?fileStatus=missing_pdf"
        tone="red"
      />
      <StatCard title="Downloads" value={summary.totalDownloads.toLocaleString()} icon={Download} tone="cyan" />
      <StatCard title="Storage Used" value={formatFileSize(summary.storageKb)} icon={HardDrive} tone="purple" />
      <StatCard
        title="Weak Metadata"
        value={summary.missingMetadata}
        icon={AlertTriangle}
        href="/admin/manage?quality=incomplete"
        tone="gold"
      />
    </div>
  );
}
