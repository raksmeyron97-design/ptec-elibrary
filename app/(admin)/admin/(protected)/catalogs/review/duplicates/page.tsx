// app/admin/catalogs/review/duplicates/page.tsx
// Possible duplicates in one language queue (docs/CATALOG-REVIEW.md, Slice 6).
// The groups are the library's one grouping (lib/admin/duplicates.ts) over the
// whole catalogue; a group is listed in a queue when any of its records is in
// it, and shows every member whatever its language. High and medium groups put
// a task on their records; low groups (a title alone, a prefix) are shown only
// when asked for, and never create work.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { catalogReviewEnabled } from "@/lib/catalogs/review-flag";
import { loadReviewIndex } from "@/lib/catalogs/review-server";
import { DEFAULT_REVIEW_QUERY, REVIEW_QUEUES, isReviewQueue, reviewListHref, reviewQueueOf, reviewRecordHref } from "@/lib/catalogs/review";
import { TASK_CONFIDENCES } from "@/lib/catalogs/review-tasks";
import { EmptyState, PageHeader } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import DuplicateGroupCard, { type DuplicateCardRecord } from "./_components/DuplicateGroupCard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function CatalogDuplicatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!catalogReviewEnabled()) notFound();
  const { can } = await requireRouteAccess("catalog.review.duplicates");
  const canReview = can("catalog.review.transition");
  const t = await getTranslations("adminCatalog.review");

  const sp = (await searchParams) ?? {};
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const lang = one("language");
  const language = isReviewQueue(lang) ? lang : "km";
  const showAll = one("signals") === "all";
  const showResolved = one("resolved") === "1";
  const page = Math.max(1, Number(one("page") ?? "1") || 1);

  const supabase = createServiceClient();
  const index = await loadReviewIndex(supabase, null);
  if (!index.ok) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title={t("duplicatesTitle")} />
        <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {index.missingTable ? t("missingTable") : t("loadFailed")}
        </p>
      </div>
    );
  }

  const byId = new Map(index.items.map((i) => [i.id, i]));
  const groups = index.clusters
    .filter((g) => showAll || TASK_CONFIDENCES.includes(g.confidence))
    .filter((g) => g.books.some((b) => reviewQueueOf(index.records.get(b.id)?.language) === language))
    .map((g) => {
      const records: DuplicateCardRecord[] = g.books.map((b) => {
        const rec = index.records.get(b.id);
        const item = byId.get(b.id);
        const queue = reviewQueueOf(rec?.language);
        return {
          id: b.id,
          href: reviewRecordHref(b.id, { ...DEFAULT_REVIEW_QUERY, language: queue }),
          title: rec?.title ?? b.title,
          author: rec?.author ?? null,
          isbn: rec?.isbn ?? null,
          year: rec?.year ?? null,
          callNumber: rec?.callNumber ?? null,
          languageLabel: queue ? t(`queue.${queue}`) : t("queue.none"),
          version: item?.review?.version ?? 0,
          waived: item?.review?.waivedTasks.includes("duplicate") ?? false,
        };
      });
      return { key: g.key, confidence: g.confidence, signals: g.signals, records, resolved: records.every((r) => r.waived) };
    })
    .filter((g) => showResolved || !g.resolved);

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const shown = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams({ language, ...(showAll ? { signals: "all" } : {}), ...(showResolved ? { resolved: "1" } : {}) });
    for (const [k, v] of Object.entries(over)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/admin/catalogs/review/duplicates?${p}`;
  };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={reviewListHref({ ...DEFAULT_REVIEW_QUERY, language })} className="text-xs font-semibold text-text-muted hover:text-brand">
            ← {t(`queue.${language}`)}
          </Link>
        }
        title={t("duplicatesTitle")}
        description={t("duplicatesDescription")}
      />
      <nav aria-label={t("queuesAria")} className="flex flex-wrap gap-2">
        {REVIEW_QUEUES.map((q) => (
          <Link
            key={q}
            href={qs({ language: q, page: null })}
            aria-current={q === language ? "page" : undefined}
            className={`focus-field inline-flex min-h-10 items-center rounded-lg border px-4 text-sm font-semibold ${q === language ? "border-admin-accent text-admin-accent-text" : "border-divider text-text-body"}`}
          >
            {t(`queue.${q}`)}
          </Link>
        ))}
        <Link href={qs({ signals: showAll ? null : "all", page: null })} className="focus-field inline-flex min-h-10 items-center rounded-lg border border-divider px-4 text-sm text-text-body">
          {showAll ? t("signalsStrongOnly") : t("signalsAll")}
        </Link>
        <Link href={qs({ resolved: showResolved ? null : "1", page: null })} className="focus-field inline-flex min-h-10 items-center rounded-lg border border-divider px-4 text-sm text-text-body">
          {showResolved ? t("hideResolved") : t("showResolved")}
        </Link>
      </nav>
      <p className="text-sm text-text-muted">{t("groupCount", { count: groups.length })}</p>
      {shown.length === 0 ? (
        <EmptyState title={t("noDuplicatesTitle")} description={t("noDuplicatesBody")} />
      ) : (
        <ul className="space-y-3">
          {shown.map((g) => (
            <DuplicateGroupCard key={g.key} confidence={g.confidence} signals={g.signals} records={g.records} canReview={canReview} />
          ))}
        </ul>
      )}
      <Pagination
        currentPage={Math.min(page, totalPages)}
        totalPages={totalPages}
        totalItems={groups.length}
        pageSize={PAGE_SIZE}
        searchParams={{ language, ...(showAll ? { signals: "all" } : {}), ...(showResolved ? { resolved: "1" } : {}), page: String(page) }}
        basePath="/admin/catalogs/review/duplicates"
      />
    </div>
  );
}
