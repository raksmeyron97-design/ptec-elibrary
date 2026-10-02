import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { getJournalForAdmin } from "@/app/actions/journals";
import { PageHeader, StatusBadge } from "@/components/admin/kit";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { journalPath } from "@/lib/journals/urls";
import JournalForm from "../_components/JournalForm";
import IssuesEditor from "../_components/IssuesEditor";

type Tab = "details" | "issues";

/**
 * One journal, two jobs: its details (what the public page says about it) and
 * its issues and their tables of contents. Tabs are links (`?tab=issues`), so
 * each is a real URL a librarian can bookmark or be sent to.
 */
export default async function EditJournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRouteAccess("journals.edit");
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const tab: Tab = rawTab === "issues" ? "issues" : "details";
  const [t, detail] = await Promise.all([getTranslations("adminJournals"), getJournalForAdmin(id)]);
  if (!detail) notFound();
  const { journal } = detail;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "details", label: t("tabDetails") },
    { id: "issues", label: t("tabIssues"), count: detail.issues.length },
  ];

  return (
    <div className="w-full space-y-6">
      <PageHeader
        breadcrumb={
          <Link
            href="/admin/journals"
            className="focus-field inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-text-muted transition-colors hover:text-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToList")}
          </Link>
        }
        title={journal.title}
        description={t("editJournal")}
        actions={
          <>
            <StatusBadge tone={journal.is_published ? "success" : "neutral"}>
              {journal.is_published ? t("published") : t("draft")}
            </StatusBadge>
            {journal.is_published && (
              <a
                href={journalPath(journal.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-field inline-flex items-center gap-1 rounded text-sm font-medium text-text-muted hover:text-brand"
              >
                {t("viewPublic")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </>
        }
      />

      <nav aria-label={t("editJournal")} className="flex gap-1 border-b border-divider">
        {tabs.map((tb) => (
          <Link
            key={tb.id}
            href={tb.id === "details" ? `/admin/journals/${id}` : `/admin/journals/${id}?tab=issues`}
            aria-current={tab === tb.id ? "page" : undefined}
            className={`focus-field -mb-px inline-flex min-h-10 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm font-semibold transition-colors ${
              tab === tb.id ? "border-brand text-brand" : "border-transparent text-text-muted hover:text-text-heading"
            }`}
          >
            {tb.label}
            {tb.count !== undefined && <span className="rounded-full bg-paper px-1.5 text-xs tabular-nums">{tb.count}</span>}
          </Link>
        ))}
      </nav>

      {tab === "details" ? (
        <JournalForm initial={journal} publishedArticleCount={detail.publishedArticleCount} />
      ) : (
        <IssuesEditor volumes={detail.volumes} issues={detail.issues} />
      )}
    </div>
  );
}
