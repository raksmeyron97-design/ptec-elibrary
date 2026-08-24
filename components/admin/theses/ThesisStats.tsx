import { FileText, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import StatCard from "@/components/admin/dashboard/StatCard";
import type { ThesesSummary } from "@/lib/admin/theses-shared";

/**
 * Four primary metrics for the Manage Theses page.
 *
 * This was eight tinted cards. Two of them — Views and Downloads — were
 * repository-wide totals sitting above a table whose own Stats column carries
 * the per-thesis figures, so the number a librarian could act on and the
 * number they were shown were never the same one; they now live only in the
 * row. Drafts and Missing files were dropped from the strip rather than the
 * product: both are still one click away as filter chips on the rows they
 * describe, and `?status=draft` / `?fileStatus=missing_pdf` still work.
 *
 * The four that stay are the ones that answer "is there work to do?" — the
 * size of the collection, how much of it is live, what is waiting on a
 * reviewer, and what would embarrass us if it went live as-is. Colour is
 * assigned by meaning, not by variety: brand for the neutral total, success
 * for published, warning for the queue, danger for the defect count.
 */
export default function ThesisStats({ summary }: { summary: ThesesSummary }) {
  const t = useTranslations("adminTheses.stats");
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        variant="quiet"
        title={t("total")}
        value={summary.total}
        icon={FileText}
        href="/admin/theses"
        tone="blue"
      />
      <StatCard
        variant="quiet"
        title={t("published")}
        value={summary.published}
        icon={CheckCircle2}
        href="/admin/theses?status=published"
        tone="green"
      />
      <StatCard
        variant="quiet"
        title={t("pendingReview")}
        value={summary.pendingReview}
        icon={Clock}
        href="/admin/theses?status=pending_review"
        tone="orange"
      />
      <StatCard
        variant="quiet"
        title={t("missingMetadata")}
        value={summary.missingMetadata}
        icon={AlertTriangle}
        href="/admin/theses?metadataQuality=incomplete"
        tone="red"
      />
    </div>
  );
}
