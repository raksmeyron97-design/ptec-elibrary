import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Download,
  HardDrive,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { formatFileSize, type EbooksSummary } from "@/lib/admin/ebooks-shared";

/**
 * Manage E-books KPI zone: four neutral cards for the numbers a librarian
 * reads every day, then one row of pills for the queues they only act on
 * when non-zero.
 *
 * This replaced eight tinted StatCards in a single row. Eight colours meant
 * none of them signalled anything — a red "0 missing PDFs" read as an error
 * when it was the healthy state. Here colour appears exactly twice: the
 * success tick on Live, and the attention dot on a queue with work in it.
 * Every card and pill that maps to a filter deep-links straight into it.
 */

const cardIcon = "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]";

function StatCard({
  label,
  value,
  sub,
  subTone = "muted",
  icon: Icon,
  iconClass,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  subTone?: "muted" | "success";
  icon: LucideIcon;
  iconClass: string;
  href?: string;
}) {
  const isZero = value === 0 || value === "—";
  const body = (
    <>
      <span className={`${cardIcon} ${iconClass}`} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${isZero ? "text-text-muted" : "text-text-heading"}`}
      >
        {value}
      </p>
      {/* Reserved line — keeps all four cards the same height whether or not
          they have something to say. */}
      <p className={`mt-1 min-h-4 text-xs ${subTone === "success" ? "text-success-text" : "text-text-muted"}`}>
        {sub ?? ""}
      </p>
    </>
  );

  const shell = "rounded-xl border border-divider bg-bg-surface p-4 shadow-sm";

  return href ? (
    <Link
      href={href}
      className={`${shell} block transition-colors duration-150 hover:border-border-strong hover:bg-paper/40`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

function BreakdownPill({ label, count, href, attention }: { label: string; count: number; href: string; attention?: boolean }) {
  const active = count > 0;
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-divider bg-bg-surface px-3 py-1.5 text-sm text-text-body transition-colors duration-150 hover:border-border-strong hover:bg-paper"
    >
      {attention && active && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning-line" aria-hidden="true" />
      )}
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`tabular-nums font-semibold ${active ? "text-text-heading" : "text-text-muted"}`}
      >
        {active ? count.toLocaleString() : "—"}
      </span>
    </Link>
  );
}

export default function EbookStats({ summary }: { summary: EbooksSummary }) {
  const t = useTranslations("adminEbooks.stats");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("total")}
          value={summary.total.toLocaleString()}
          sub={summary.archived > 0 ? t("archived", { count: summary.archived }) : undefined}
          icon={BookOpen}
          iconClass="bg-surface-brand-soft text-brand"
          href="/admin/manage"
        />
        <StatCard
          label={t("live")}
          value={summary.live.toLocaleString()}
          sub={summary.pendingReview > 0 ? t("awaitingReview", { count: summary.pendingReview }) : undefined}
          icon={CheckCircle2}
          iconClass="bg-success-soft text-success-text"
          href="/admin/manage?status=published"
        />
        <StatCard
          label={t("downloads")}
          value={summary.totalDownloads.toLocaleString()}
          sub={summary.totalViews > 0 ? t("views", { count: summary.totalViews }) : undefined}
          icon={Download}
          iconClass="bg-info-soft text-info-text"
        />
        <StatCard
          label={t("storage")}
          value={formatFileSize(summary.storageKb)}
          icon={HardDrive}
          iconClass="bg-paper text-text-muted"
        />
      </div>

      <div
        className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1"
        aria-label={t("breakdown")}
      >
        <BreakdownPill label={t("drafts")} count={summary.drafts} href="/admin/manage?status=draft" />
        <BreakdownPill
          label={t("needsReview")}
          count={summary.pendingReview}
          href="/admin/manage?status=pending_review"
          attention
        />
        <BreakdownPill
          label={t("missingCovers")}
          count={summary.missingCovers}
          href="/admin/manage?coverStatus=missing_cover"
          attention
        />
        <BreakdownPill
          label={t("missingPdfs")}
          count={summary.missingPdfs}
          href="/admin/manage?fileStatus=missing_pdf"
          attention
        />
        <BreakdownPill
          label={t("brokenFiles")}
          count={summary.brokenFiles}
          href="/admin/manage?fileStatus=broken_file"
          attention
        />
        <BreakdownPill
          label={t("weakMetadata")}
          count={summary.missingMetadata}
          href="/admin/manage?quality=incomplete"
          attention
        />
        <BreakdownPill label={t("archivedLabel")} count={summary.archived} href="/admin/manage?status=archived" />
      </div>
    </div>
  );
}
