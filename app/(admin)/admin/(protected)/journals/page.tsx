import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ExternalLink, Plus } from "lucide-react";

import { getJournalMappingReport, listJournalsForAdmin, type AdminJournalRow } from "@/app/actions/journals";
import { PageHeader, EmptyState, StatusBadge } from "@/components/admin/kit";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_CLASS } from "@/components/admin/kit/form";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { journalPath } from "@/lib/journals/urls";
import { MAPPING_STATUSES } from "@/lib/journals/mapping";
import { journalReadiness } from "@/lib/journals/readiness";
import { normalizeIssn } from "@/lib/seo/identifiers";
import AliasAssign from "./_components/AliasAssign";

type Tab = "journals" | "unmatched";
type StatusFilter = "all" | "published" | "draft" | "attention";
const STATUS_FILTERS: StatusFilter[] = ["all", "published", "draft", "attention"];

/** Below this a journal's public page is mostly blank — it asks for attention. */
const ATTENTION_BELOW = 60;

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function matches(j: AdminJournalRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const issn = normalizeIssn(q);
  return (
    [j.title, j.title_km, j.short_title, j.publisher_name, j.slug, ...j.aliases].some((v) => v?.toLowerCase().includes(needle)) ||
    (!!issn && [j.issn, j.print_issn, j.e_issn, j.issn_l].some((v) => normalizeIssn(v) === issn))
  );
}

/**
 * Journals (0148/0166): the shelf journal articles sit on. Two tabs, because
 * they are two jobs: the journals themselves (search, status, how complete
 * each public page is), and the queue of article journal names that resolve
 * to no journal — the operational half of "never guess", which now has its
 * own tab and count instead of sitting under the table.
 */
export default async function AdminJournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; q?: string | string[]; status?: string | string[] }>;
}) {
  const { can } = await requireRouteAccess("journals.manage");
  const sp = await searchParams;
  const tab: Tab = first(sp.tab) === "unmatched" ? "unmatched" : "journals";
  const q = (first(sp.q) ?? "").trim().slice(0, 200);
  const statusRaw = first(sp.status) as StatusFilter | undefined;
  const status: StatusFilter = statusRaw && STATUS_FILTERS.includes(statusRaw) ? statusRaw : "all";

  const [t, { data: journals, error }, mapping] = await Promise.all([
    getTranslations("adminJournals"),
    listJournalsForAdmin(),
    getJournalMappingReport(),
  ]);
  const canCreate = can("journals.create");
  const canEdit = can("journals.edit");

  const rows = journals.map((j) => ({ j, r: journalReadiness(j) }));
  const needsAttention = (r: (typeof rows)[number]["r"]) => r.score < ATTENTION_BELOW || r.invalidIssns.length > 0;
  const shown = rows.filter(({ j, r }) => {
    if (!matches(j, q)) return false;
    if (status === "published") return j.is_published;
    if (status === "draft") return !j.is_published;
    if (status === "attention") return needsAttention(r);
    return true;
  });

  // Unmatched names, one row per name (several articles usually share one).
  const byName = new Map<string, typeof mapping.problems>();
  for (const p of mapping.problems) {
    const key = p.journal_name?.trim() || "";
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  const unmatched = [...byName.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const journalOptions = journals.map((j) => ({ id: j.id, title: j.title }));

  const tabLink = (id: Tab) => (id === "journals" ? "/admin/journals" : "/admin/journals?tab=unmatched");
  const filterLink = (s: StatusFilter) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (s !== "all") params.set("status", s);
    const qs = params.toString();
    return qs ? `/admin/journals?${qs}` : "/admin/journals";
  };
  const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="w-full space-y-6">
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

      <nav aria-label={t("title")} className="flex gap-1 border-b border-divider">
        {(
          [
            ["journals", t("tabJournals"), journals.length],
            ["unmatched", t("tabUnmatched"), mapping.problems.length],
          ] as const
        ).map(([id, label, count]) => (
          <Link
            key={id}
            href={tabLink(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`focus-field -mb-px inline-flex min-h-10 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm font-semibold transition-colors ${
              tab === id ? "border-brand text-brand" : "border-transparent text-text-muted hover:text-text-heading"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 text-xs tabular-nums ${
                id === "unmatched" && count > 0 ? "bg-warning-soft text-warning-text" : "bg-paper"
              }`}
            >
              {count}
            </span>
          </Link>
        ))}
      </nav>

      {tab === "journals" ? (
        error ? (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text">
            {t("errorGeneric")}
          </p>
        ) : journals.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form method="get" action="/admin/journals" role="search" className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="journal-search" className="mb-1.5 block text-sm font-medium text-text-body">
                    {t("searchLabel")}
                  </label>
                  <input
                    id="journal-search"
                    name="q"
                    type="search"
                    defaultValue={q}
                    placeholder={t("searchPlaceholder")}
                    className={`${INPUT_CLASS} w-72 max-w-full`}
                  />
                </div>
                {status !== "all" && <input type="hidden" name="status" value={status} />}
                <button type="submit" className={BTN_SECONDARY}>
                  {t("searchSubmit")}
                </button>
              </form>
              <nav aria-label={t("filterStatus")} className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((s) => (
                  <Link
                    key={s}
                    href={filterLink(s)}
                    aria-current={status === s ? "true" : undefined}
                    className={`focus-field inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors ${
                      status === s ? "border-brand bg-brand text-brand-contrast" : "border-divider text-text-body hover:border-brand/40"
                    }`}
                  >
                    {t(`filter${s[0].toUpperCase()}${s.slice(1)}` as "filterAll")}
                  </Link>
                ))}
              </nav>
            </div>

            {shown.length === 0 ? (
              <EmptyState title={t("noMatches")} />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-b border-divider bg-paper text-left text-xs font-semibold text-text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3">{t("colTitle")}</th>
                      <th scope="col" className="px-4 py-3 text-right">{t("colArticles")}</th>
                      <th scope="col" className="px-4 py-3 text-right">{t("colIssues")}</th>
                      <th scope="col" className="px-4 py-3">{t("colCompleteness")}</th>
                      <th scope="col" className="px-4 py-3">{t("colStatus")}</th>
                      <th scope="col" className="px-4 py-3">{t("colUpdated")}</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">{t("viewPublic")}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {shown.map(({ j, r }) => (
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
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 w-20 overflow-hidden rounded-full bg-paper"
                              role="meter"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={r.score}
                              aria-label={t("completenessLabel", { score: r.score })}
                            >
                              <div
                                className={`h-full rounded-full ${needsAttention(r) ? "bg-warning" : "bg-success"}`}
                                style={{ width: `${r.score}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-text-body">{r.score}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={j.is_published ? "success" : "neutral"}>
                            {j.is_published ? t("published") : t("draft")}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {j.updated_at ? dateFmt.format(new Date(j.updated_at)) : "—"}
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
          </div>
        )
      ) : (
        <section aria-labelledby="journal-mapping" className="space-y-4">
          <h2 id="journal-mapping" className="sr-only">{t("tabUnmatched")}</h2>
          <p className="max-w-3xl text-sm text-text-muted">{t("unmatchedIntro")}</p>
          {mapping.error ? (
            <p role="alert" className="text-sm text-danger-text">{t("errorGeneric")}</p>
          ) : (
            <>
              <dl className="flex flex-wrap gap-2">
                {MAPPING_STATUSES.map((s) => (
                  <div key={s} className="rounded-lg border border-divider bg-bg-surface px-3 py-2">
                    <dt className="text-xs text-text-muted">{t(`status.${s}`)}</dt>
                    <dd className="text-lg font-semibold tabular-nums text-text-heading">{mapping.counts[s]}</dd>
                  </div>
                ))}
              </dl>
              {unmatched.length === 0 ? (
                <p className="rounded-xl border border-divider bg-bg-surface p-5 text-sm text-text-body">{t("unmatchedNone")}</p>
              ) : (
                <ul className="divide-y divide-divider rounded-xl border border-divider bg-bg-surface">
                  {unmatched.map(([name, articles]) => (
                    <li key={name || "(none)"} className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-text-heading">{name || "—"}</p>
                        <span className="text-xs text-text-muted">{t("unmatchedCount", { count: articles.length })}</span>
                      </div>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {articles.map((r) => (
                          <li key={r.id} className="flex items-center gap-2">
                            <Link href={`/admin/publications/edit/${r.id}`} className="focus-field rounded text-brand hover:underline">
                              {r.slug}
                            </Link>
                            <span className="text-xs text-text-muted">
                              {r.volume ? `${r.volume}` : ""}
                              {r.issue_no ? `(${r.issue_no})` : ""}
                            </span>
                            <StatusBadge tone={r.mapping_status === "partial" ? "warning" : "danger"}>
                              {t(`status.${r.mapping_status}`)}
                            </StatusBadge>
                          </li>
                        ))}
                      </ul>
                      {name && (canCreate || canEdit) && (
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                          {canCreate && (
                            <Link href={`/admin/journals/new?title=${encodeURIComponent(name)}`} className={BTN_SECONDARY}>
                              <Plus className="h-4 w-4" aria-hidden="true" />
                              {t("createFromName")}
                            </Link>
                          )}
                          {canEdit && journalOptions.length > 0 && <AliasAssign name={name} journals={journalOptions} />}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
