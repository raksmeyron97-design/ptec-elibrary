// app/admin/catalogs/review/page.tsx
// The two language review queues of the Physical Library (docs/CATALOG-REVIEW.md):
// Khmer books (BK) and English & other languages (BKEN). One read of the
// catalogue and the review rows gives the counts on both cards AND the list of
// the chosen queue, so they cannot disagree about a record.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { catalogReviewEnabled } from "@/lib/catalogs/review-flag";
import { loadProfileNames, loadReviewIndex } from "@/lib/catalogs/review-server";
import {
  ASSIGNEE_FILTERS,
  REVIEW_QUEUES,
  REVIEW_SORTS,
  STATUS_FILTERS,
  claimState,
  matchesReviewQuery,
  parseReviewQuery,
  reviewCounts,
  reviewListHref,
  reviewQueryString,
  reviewRecordHref,
  sortQueue,
  statusOf,
  type ReviewRow,
} from "@/lib/catalogs/review";
import { EmptyState, PageHeader } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import ReviewListTable, { type ReviewListRow } from "./_components/ReviewListTable";
import { REVIEW_TASK_IDS, openBlockingTasks, openTasks } from "@/lib/catalogs/review-tasks";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;


export default async function CatalogReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!catalogReviewEnabled()) notFound();
  const { userId, can } = await requireRouteAccess("catalog.review");
  const canReview = can("catalog.review.transition");
  const t = await getTranslations("adminCatalog.review");

  const sp = (await searchParams) ?? {};
  const query = parseReviewQuery(sp);
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const page = Math.max(1, Number(one("page") ?? "1") || 1);
  const done = one("done") === "1";

  const supabase = createServiceClient();
  const index = await loadReviewIndex(supabase, null);

  if (!index.ok) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {index.missingTable ? t("missingTable") : t("loadFailed")}
        </p>
      </div>
    );
  }

  const rows = new Map<string, ReviewRow>();
  for (const item of index.items) if (item.review) rows.set(item.id, item.review);
  const counts = reviewCounts(index.items, rows);

  const now = new Date();
  const list = query.language
    ? sortQueue(index.items, query.sort).filter((item) => matchesReviewQuery(item, query, userId, now))
    : [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageItems = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const names = await loadProfileNames(supabase, pageItems.map((i) => i.review?.assignedTo ?? i.review?.reviewedBy));
  const first = list[0];

  const selectCls = "focus-field h-10 rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body";

  return (
    <div className="w-full space-y-6">
      <PageHeader
        breadcrumb={
          <Link href="/admin/catalogs" className="text-xs font-semibold text-text-muted hover:text-brand">
            {t("breadcrumbCatalog")}
          </Link>
        }
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      {/* The two queues. A card is a link: choosing a language is navigation, and the URL keeps it. */}
      <nav aria-label={t("queuesAria")} className="grid gap-4 sm:grid-cols-2">
        {REVIEW_QUEUES.map((queue) => {
          const c = counts[queue];
          const selected = query.language === queue;
          return (
            <Link
              key={queue}
              href={reviewListHref({ ...query, language: queue })}
              aria-current={selected ? "page" : undefined}
              className={`focus-field block rounded-xl border bg-bg-surface p-5 shadow-sm transition-colors motion-reduce:transition-none ${
                selected ? "border-admin-accent ring-1 ring-admin-accent" : "border-divider hover:border-admin-accent/60"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t(`queueShort.${queue}`)}</p>
              <p className="mt-1 text-lg font-semibold text-text-heading">{t(`queue.${queue}`)}</p>
              <p className="mt-2 text-sm text-text-body">
                {t("cardTotal", { count: c.total })} · <span className="font-semibold">{t("cardNeedsReview", { count: c.needsReview })}</span>
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {t("cardBreakdown", { inReview: c.inReview, verified: c.verified, blocked: c.blocked })}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-admin-accent-text">
                {t(`open.${queue}`)}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </nav>

      {counts.noLanguage > 0 && (
        <p role="status" className="rounded-xl border border-warning-line bg-warning-soft px-4 py-2.5 text-sm text-warning-text">
          {t("noLanguage", { count: counts.noLanguage })}
        </p>
      )}

      {query.language && (
        <section aria-labelledby="review-queue-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="review-queue-heading" className="text-lg font-semibold text-text-heading">
              {t(`queue.${query.language}`)} · {t("listCount", { count: list.length })}
            </h2>
            <Link
              href={`/admin/catalogs/review/duplicates?language=${query.language}`}
              className="focus-field inline-flex h-10 items-center rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body hover:bg-paper"
            >
              {t("openDuplicates")}
            </Link>
            {canReview && first && (
              <Link href={reviewRecordHref(first.id, query)} className="focus-field inline-flex h-10 items-center gap-2 rounded-lg bg-admin-accent px-5 text-sm font-semibold text-white hover:bg-admin-accent-hover">
                {t(`continue.${query.language}`)}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>

          {done && (
            <p role="status" className="flex items-center gap-2 rounded-xl border border-success-line bg-success-soft px-4 py-2.5 text-sm text-success-text">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t("queueEnd")}
            </p>
          )}

          {/* A GET form: the filters are the URL, and work without JavaScript. */}
          <form method="get" action="/admin/catalogs/review" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="language" value={query.language} />
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              {t("filterStatus")}
              <select name="status" defaultValue={query.status} className={selectCls}>
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>{t(`filter.status.${s}`)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              {t("filterAssignee")}
              <select name="assignee" defaultValue={query.assignee} className={selectCls}>
                {ASSIGNEE_FILTERS.map((a) => (
                  <option key={a} value={a}>{t(`filter.assignee.${a}`)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              {t("filterTask")}
              <select name="task" defaultValue={query.task ?? ""} className={selectCls}>
                <option value="">{t("filter.task.any")}</option>
                {REVIEW_TASK_IDS.map((id) => (
                  <option key={id} value={id}>{t("filter.task.open", { task: t(`task.${id}`) })}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
              {t("filterOrder")}
              <select name="sort" defaultValue={query.sort} className={selectCls}>
                {REVIEW_SORTS.map((o) => (
                  <option key={o} value={o}>{t(`filter.sort.${o}`)}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="focus-field h-10 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body hover:bg-paper">
              {t("applyFilters")}
            </button>
          </form>

          {pageItems.length === 0 ? (
            <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
          ) : (
            <ReviewListTable
              queue={query.language}
              queueLabel={t(`queue.${query.language}`)}
              canReview={canReview}
              queryString={reviewQueryString(query)}
              rows={pageItems.map((item): ReviewListRow => {
                const status = statusOf(item.review);
                const claim = claimState(item.review, userId, now);
                const who =
                  status === "in_review" && item.review?.assignedTo
                    ? claim === "mine"
                      ? t("you")
                      : names.get(item.review.assignedTo) ?? t("someoneElse")
                    : status === "verified" && item.review?.reviewedBy
                      ? names.get(item.review.reviewedBy) ?? t("someoneElse")
                      : "—";
                return {
                  id: item.id,
                  href: reviewRecordHref(item.id, query),
                  title: item.title,
                  author: item.author,
                  callNumber: item.callNumber,
                  isActive: item.isActive,
                  status,
                  version: item.review?.version ?? 0,
                  staleClaim: claim === "stale",
                  who,
                  openTasks: openTasks(item.tasks).length,
                  blockingTasks: openBlockingTasks(item.tasks).length,
                };
              })}
            />
          )}

          <Pagination
            currentPage={Math.min(page, totalPages)}
            totalPages={totalPages}
            totalItems={list.length}
            pageSize={PAGE_SIZE}
            searchParams={{ ...Object.fromEntries(new URLSearchParams(reviewListHref(query).split("?")[1] ?? "")), page: String(page) }}
            basePath="/admin/catalogs/review"
          />
        </section>
      )}
    </div>
  );
}
