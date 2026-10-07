import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { pagedScan } from "@/lib/db/paged-scan";
import { PageHeader, EmptyState } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import BooksBreadcrumb from "@/components/admin/ebooks/BooksBreadcrumb";
import BooksWorkspaceNav from "@/components/admin/ebooks/BooksWorkspaceNav";
import { EBOOKS_RETIRED_URLS_PATH } from "@/lib/admin/ebooks-url";
import { parseQueueTab, suggestSuccessors, type Candidate, type QueueRow } from "@/lib/url-redirects/queue";
import { resolvedElsewhere } from "@/lib/url-redirects/resolved";
import RetiredUrlTabs from "./_components/RetiredUrlTabs";
import PendingRow, { type UIPendingRow } from "./_components/PendingRow";
import IgnoreResolvedButton from "./_components/IgnoreResolvedButton";
import RedirectsTable, { type UIRedirect } from "./_components/RedirectsTable";

// The retired-URL queue (migration 0170, SEO audit 2026-10 WI-1).
//
// A public URL that stopped existing — its record deleted or unpublished, or
// one of the 43 seeded dead URLs — waits here for a librarian. Nothing on this
// page changes a URL by itself: suggestions are readings, and every decision
// is a Server Action that re-checks the database (app/actions/retired-urls.ts).
export const dynamic = "force-dynamic";

const BASE_PATH = EBOOKS_RETIRED_URLS_PATH;
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 25;
const SCAN_CAP = 20_000;

type SP = { tab?: string; page?: string; size?: string };

type RedirectRow = {
  old_path: string;
  target_path: string | null;
  status: number;
  reason: string;
  created_at: string;
  created_by: string | null;
};

export default async function RetiredUrlsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, can } = await requireRouteAccess("books.retiredUrls");
  const [sp, t, locale] = await Promise.all([searchParams, getTranslations("adminRetiredUrls"), getLocale()]);
  const canResolve = can("books.retiredUrls.resolve");
  const canViewRedirects = can("books.retiredUrls.viewRedirects");
  const canDeleteRedirect = can("books.retiredUrls.deleteRedirect");

  let tab = parseQueueTab(sp.tab);
  if (tab === "redirects" && !canViewRedirects) tab = "pending";

  // The queue is small (one row per URL that ever left the site), so it is
  // read whole and split here; pagedScan because db-max-rows clips silently.
  const queue = await pagedScan<QueueRow>(
    (from, to) =>
      supabase
        .from("retired_url_queue")
        .select("path, record_type, title, cause, suggested_path, note, retired_at, resolution")
        .order("retired_at", { ascending: false })
        .order("path", { ascending: true })
        .range(from, to),
    SCAN_CAP,
  );
  const pending = queue.data.filter((r) => r.resolution === "pending");
  const resolved = queue.data.filter((r) => r.resolution !== "pending");

  const elsewhere = await resolvedElsewhere(supabase, pending.map((r) => r.path));

  const redirects = canViewRedirects
    ? await pagedScan<RedirectRow>(
        (from, to) =>
          supabase
            .from("url_redirects")
            .select("old_path, target_path, status, reason, created_at, created_by")
            .order("created_at", { ascending: false })
            .order("old_path", { ascending: true })
            .range(from, to),
        SCAN_CAP,
      )
    : { data: [] as RedirectRow[], error: null };

  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(sp.size)) ? Number(sp.size) : DEFAULT_PAGE_SIZE;
  const list = tab === "pending" ? pending : tab === "resolved" ? resolved : redirects.data;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(Math.max(1, Number(sp.page ?? "1") || 1), totalPages);
  const start = (page - 1) * pageSize;

  const dateFormat = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const value = new Date(iso);
    return Number.isNaN(value.getTime()) ? null : dateFormat.format(value);
  };

  // Suggestions only for the rows on screen, against every live book and
  // thesis title. A failed candidate read shows no suggestions and says so —
  // never a confident "nothing similar".
  let uiPending: UIPendingRow[] = [];
  let candidatesFailed = false;
  if (tab === "pending" && pending.length > 0) {
    const [books, theses] = await Promise.all([
      pagedScan<{ slug: string | null; title: string | null }>(
        (from, to) => supabase.from("books").select("slug, title").eq("is_published", true).order("id").range(from, to),
        SCAN_CAP,
      ),
      pagedScan<{ slug: string | null; title: string | null }>(
        (from, to) =>
          supabase.from("research_reports").select("slug, title").eq("is_published", true).order("id").range(from, to),
        SCAN_CAP,
      ),
    ]);
    candidatesFailed = Boolean(books.error || theses.error);
    const candidates: Candidate[] = [
      ...books.data.filter((r) => r.slug && r.title).map((r) => ({ path: `/books/${r.slug}`, title: r.title as string })),
      ...theses.data.filter((r) => r.slug && r.title).map((r) => ({ path: `/theses/${r.slug}`, title: r.title as string })),
    ];
    uiPending = pending.slice(start, start + pageSize).map((row) => ({
      path: row.path,
      recordType: row.record_type,
      title: row.title,
      cause: row.cause,
      note: row.note,
      suggestedPath: row.suggested_path,
      retiredLabel: formatDate(row.retired_at),
      resolvedElsewhere: elsewhere?.has(row.path) ?? false,
      suggestions: candidatesFailed ? [] : suggestSuccessors(row, candidates),
    }));
  }

  const uiRedirects: UIRedirect[] = redirects.data.slice(start, start + pageSize).map((r) => ({
    oldPath: r.old_path,
    targetPath: r.target_path,
    status: r.status,
    reason: r.reason,
    createdLabel: formatDate(r.created_at),
    byPerson: Boolean(r.created_by),
  }));

  const resolvedElsewhereCount = elsewhere ? pending.filter((r) => elsewhere.has(r.path)).length : 0;
  const searchParamsRecord = sp as Record<string, string | undefined>;
  const readFailed = Boolean(queue.error) || (tab === "redirects" && Boolean(redirects.error));

  return (
    <div className="w-full space-y-6">
      <PageHeader
        breadcrumb={<BooksBreadcrumb current={t("title")} />}
        title={t("title")}
        description={t("description")}
        className="mb-4"
      />

      <BooksWorkspaceNav current="retiredUrls" retiredUrlCount={pending.length} />

      {readFailed && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-text"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t("readFailed")}</p>
        </div>
      )}

      <RetiredUrlTabs
        basePath={BASE_PATH}
        tab={tab}
        pendingCount={pending.length}
        resolvedCount={resolved.length}
        redirectCount={canViewRedirects ? redirects.data.length : null}
      />

      {tab === "pending" && (
        <>
          {elsewhere === null && (
            <p role="status" className="text-sm text-warning-text">
              {t("elsewhereUnavailable")}
            </p>
          )}
          {candidatesFailed && (
            <p role="status" className="text-sm text-warning-text">
              {t("suggestionsUnavailable")}
            </p>
          )}
          {canResolve && resolvedElsewhereCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-divider bg-paper px-4 py-3 text-sm text-text-body">
              <p>{t("elsewhereSummary", { count: resolvedElsewhereCount })}</p>
              <IgnoreResolvedButton count={resolvedElsewhereCount} />
            </div>
          )}
          {pending.length === 0 && !queue.error ? (
            <EmptyState
              icon={<CheckCircle2 className="h-6 w-6 text-success" />}
              title={t("empty.title")}
              description={t("empty.description")}
            />
          ) : (
            <ul className="space-y-4">
              {uiPending.map((row) => (
                <PendingRow key={row.path} row={row} canResolve={canResolve} />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "resolved" &&
        (resolved.length === 0 ? (
          <EmptyState title={t("resolvedEmpty.title")} description={t("resolvedEmpty.description")} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-divider bg-paper text-xs font-semibold text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5">{t("columns.path")}</th>
                  <th scope="col" className="px-4 py-2.5">{t("columns.title")}</th>
                  <th scope="col" className="px-4 py-2.5">{t("columns.resolution")}</th>
                  <th scope="col" className="px-4 py-2.5">{t("columns.retired")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {resolved.slice(start, start + pageSize).map((row) => (
                  <tr key={row.path}>
                    <td className="max-w-[24rem] break-all px-4 py-2.5 font-mono text-xs text-text-body">{row.path}</td>
                    <td className="px-4 py-2.5 text-text-body">{row.title ?? "—"}</td>
                    <td className="px-4 py-2.5 text-text-body">{t(`resolution.${row.resolution}`)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">{formatDate(row.retired_at) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "redirects" &&
        (redirects.data.length === 0 ? (
          <EmptyState title={t("redirectsEmpty.title")} description={t("redirectsEmpty.description")} />
        ) : (
          <RedirectsTable rows={uiRedirects} canDelete={canDeleteRedirect} />
        ))}

      {list.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={list.length}
          pageSize={pageSize}
          searchParams={searchParamsRecord}
          basePath={BASE_PATH}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
      )}
    </div>
  );
}
