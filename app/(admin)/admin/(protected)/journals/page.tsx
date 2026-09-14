import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ExternalLink, Plus } from "lucide-react";

import { getJournalMappingReport, listJournalsForAdmin } from "@/app/actions/journals";
import { PageHeader, EmptyState, StatusBadge } from "@/components/admin/kit";
import { BTN_PRIMARY } from "@/components/admin/kit/form";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { journalPath } from "@/lib/journals/urls";
import { MAPPING_STATUSES } from "@/lib/journals/mapping";

/**
 * Journals (0148): the shelf journal articles sit on.
 *
 * Two panels: the journals themselves, and the MAPPING report — which article
 * names resolve to a journal and which do not. The report is the operational
 * half of "never guess": an unmapped name is something an admin resolves by
 * creating a journal or adding an alias, and this is where they see it.
 */
export default async function AdminJournalsPage() {
  const { can } = await requireRouteAccess("journals.manage");
  const [t, { data: journals, error }, mapping] = await Promise.all([
    getTranslations("adminJournals"),
    listJournalsForAdmin(),
    getJournalMappingReport(),
  ]);
  const canCreate = can("journals.create");
  const canEdit = can("journals.edit");

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canCreate ? (
            <Link href="/admin/journals/new" className={BTN_PRIMARY}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("newJournal")}
            </Link>
          ) : null
        }
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {t("errorGeneric")}
        </p>
      ) : journals.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-divider bg-paper text-left text-xs font-semibold text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">{t("colTitle")}</th>
                <th scope="col" className="px-4 py-3 text-right">{t("colArticles")}</th>
                <th scope="col" className="px-4 py-3 text-right">{t("colIssues")}</th>
                <th scope="col" className="px-4 py-3">{t("colStatus")}</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">{t("viewPublic")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {journals.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <Link href={`/admin/journals/${j.id}`} className="focus-field rounded font-semibold text-text-heading hover:text-brand">
                        {j.title}
                      </Link>
                    ) : (
                      <span className="font-semibold text-text-heading">{j.title}</span>
                    )}
                    <span className="mt-0.5 block font-mono text-xs text-text-muted">/journals/{j.slug}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.articleCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.issueCount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={j.is_published ? "success" : "neutral"}>
                      {j.is_published ? t("published") : t("draft")}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {j.is_published && (
                      <a
                        href={journalPath(j.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="focus-field inline-flex items-center gap-1 rounded text-xs font-medium text-text-muted hover:text-brand"
                      >
                        {t("viewPublic")}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="journal-mapping" className="rounded-xl border border-divider bg-bg-surface p-5">
        <h2 id="journal-mapping" className="text-base font-semibold text-text-heading">{t("mappingHeading")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">{t("mappingHint")}</p>
        {mapping.error ? (
          <p role="alert" className="mt-3 text-sm text-danger-text">{t("errorGeneric")}</p>
        ) : (
          <>
            <dl className="mt-4 flex flex-wrap gap-2">
              {MAPPING_STATUSES.map((s) => (
                <div key={s} className="rounded-lg border border-divider px-3 py-2">
                  <dt className="text-xs text-text-muted">{t(`status.${s}`)}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-text-heading">{mapping.counts[s]}</dd>
                </div>
              ))}
            </dl>
            {mapping.problems.length === 0 ? (
              <p className="mt-4 text-sm text-text-body">{t("mappingAllGood")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-divider rounded-lg border border-divider">
                {mapping.problems.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <Link href={`/admin/publications/edit/${r.id}`} className="focus-field rounded font-medium text-text-heading hover:text-brand">
                        {r.slug}
                      </Link>
                      <span className="ml-2 text-text-muted">
                        {r.journal_name}
                        {r.volume ? ` · ${r.volume}` : ""}
                        {r.issue_no ? `(${r.issue_no})` : ""}
                      </span>
                    </span>
                    <StatusBadge tone={r.mapping_status === "partial" ? "warning" : "danger"}>
                      {t(`status.${r.mapping_status}`)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
