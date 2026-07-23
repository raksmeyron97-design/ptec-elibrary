import { getTranslations } from "next-intl/server";
import {
  BookOpen,
  Newspaper,
  Layers,
  FileText,
  Building2,
  Barcode,
  Fingerprint,
  Globe,
  CalendarDays,
  Scale,
  Copyright,
} from "lucide-react";
import type { Publication } from "@/lib/publications";
import { getOrgIdentity } from "@/lib/system-settings/config";

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  review: "Review",
  account: "Account",
  editorial: "Editorial",
};

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="flex shrink-0 items-center gap-1.5 text-text-muted">
        <span className="text-brand/60">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 text-right font-medium text-text-heading">{value}</dd>
    </div>
  );
}

/**
 * Icon-per-row "Publication information" card. Every row is conditional on
 * the field actually existing.
 */
export default async function PublicationMetadataCard({
  pub,
  publishedOn,
  year,
}: {
  pub: Publication;
  publishedOn: string | null;
  year: string | null;
}) {
  const iconClass = "h-3.5 w-3.5";
  // A publication with no publisher of its own is published by the institution
  // — resolved from the published settings, never a compiled-in name.
  const [t, org] = await Promise.all([
    getTranslations("publicationDetail"),
    getOrgIdentity(),
  ]);

  return (
    <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-text-heading">
        {t("metadataHeading")}
      </h2>
      <dl className="divide-y divide-divider/60 text-[13px]">
        <Row icon={<BookOpen className={iconClass} />} label={t("fieldType")} value={TYPE_LABELS[pub.article_type] ?? pub.article_type} />
        {pub.journal_name && (
          <Row icon={<Newspaper className={iconClass} />} label={t("fieldJournal")} value={pub.journal_name} />
        )}
        {pub.volume && (
          <Row
            icon={<Layers className={iconClass} />}
            label={t("fieldVolume")}
            value={pub.issue_no ? `${pub.volume} (${pub.issue_no})` : pub.volume}
          />
        )}
        {(pub.page_start || pub.article_no) && (
          <Row
            icon={<FileText className={iconClass} />}
            label={t("fieldPages")}
            value={pub.page_start ? [pub.page_start, pub.page_end].filter(Boolean).join("–") : pub.article_no}
          />
        )}
        <Row icon={<Building2 className={iconClass} />} label={t("fieldPublisher")} value={pub.publisher || org.institutionName} />
        {pub.isbn && (
          <Row icon={<Barcode className={iconClass} />} label={t("fieldIsbn")} value={<span className="font-mono">{pub.isbn}</span>} />
        )}
        {pub.doi && (
          <Row
            icon={<Fingerprint className={iconClass} />}
            label={t("fieldDoi")}
            value={
              <a
                href={pub.doi.startsWith("http") ? pub.doi : `https://doi.org/${pub.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-brand hover:underline"
              >
                {pub.doi.replace(/^https?:\/\/doi\.org\//, "")}
              </a>
            }
          />
        )}
        <Row
          icon={<Globe className={iconClass} />}
          label={t("fieldLanguage")}
          value={pub.language === "km" ? "ភាសាខ្មែរ" : "English"}
        />
        {publishedOn && (
          <Row icon={<CalendarDays className={iconClass} />} label={t("fieldPublished")} value={publishedOn} />
        )}
        {!publishedOn && year && <Row icon={<CalendarDays className={iconClass} />} label={t("fieldYear")} value={year} />}
        {pub.license && <Row icon={<Scale className={iconClass} />} label={t("fieldLicense")} value={pub.license} />}
        {pub.copyright && <Row icon={<Copyright className={iconClass} />} label={t("fieldCopyright")} value={pub.copyright} />}
      </dl>
    </div>
  );
}
