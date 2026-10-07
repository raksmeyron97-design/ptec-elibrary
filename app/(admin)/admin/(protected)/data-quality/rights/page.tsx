import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, EmptyState } from "@/components/admin/kit";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { pagedScan } from "@/lib/db/paged-scan";
import { isRightsBasis } from "@/lib/books/rights";
import { rightsReviewRank } from "@/lib/books/rights-draft";
import RightsReviewRow, { type UIRightsRow } from "./_components/RightsReviewRow";
import BulkConfirmRights from "./_components/BulkConfirmRights";
import GenerateRightsDrafts from "./_components/GenerateRightsDrafts";

// The private rights-basis review (migration 0174, SEO audit 2026-10 WI-5).
// A rule drafts; a librarian confirms — one book, or an explicitly filtered
// set whose count the dialog states. Nothing here is public, and nothing on
// this page changes what a reader can do: that is a separate, later decision.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const PAGE = "/admin/data-quality/rights";

type Row = {
  book_id: string;
  basis: string | null;
  draft_basis: string | null;
  draft_source: string | null;
  evidence: string | null;
  reviewed_at: string | null;
  books: {
    title: string | null;
    slug: string | null;
    publisher: string | null;
    isbn: string | null;
    is_published: boolean | null;
    authors: { name: string | null } | null;
  } | null;
};

type SP = { view?: string; draft?: string; source?: string; page?: string };

function hrefWith(sp: SP, patch: Partial<SP>): string {
  const next = { ...sp, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${PAGE}?${s}` : PAGE;
}

export default async function RightsReviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  // The guard first: nothing is read for someone the registry refuses.
  const { supabase, can } = await requireRouteAccess("books.rights");
  const [sp, t] = await Promise.all([searchParams, getTranslations("adminDataQuality.rights")]);
  const canReview = can("books.rights.review");

  const [rights, bookCount] = await Promise.all([
    pagedScan<Row>(
      (from, to) =>
        supabase
          .from("book_rights")
          .select(
            "book_id, basis, draft_basis, draft_source, evidence, reviewed_at, books(title, slug, publisher, isbn, is_published, authors(name))",
          )
          .order("book_id")
          .range(from, to),
      50_000,
    ),
    supabase.from("books").select("id", { count: "exact", head: true }),
  ]);

  const view = sp.view === "reviewed" ? "reviewed" : "unreviewed";
  const draft = isRightsBasis(sp.draft) ? sp.draft : undefined;
  const source = sp.source && /^rule:[a-z_]{1,40}$/.test(sp.source) ? sp.source : undefined;

  const unreviewed = rights.data.filter((r) => r.basis === null);
  const reviewed = rights.data.filter((r) => r.basis !== null);
  const undrafted = bookCount.count === null ? null : Math.max(0, bookCount.count - rights.data.length);

  // The bulk sets: unreviewed rows grouped by (draft basis, rule).
  const groups = new Map<string, { draftBasis: string; source: string; count: number }>();
  for (const r of unreviewed) {
    if (!r.draft_basis || !r.draft_source) continue;
    const key = `${r.draft_basis}|${r.draft_source}`;
    const g = groups.get(key) ?? { draftBasis: r.draft_basis, source: r.draft_source, count: 0 };
    g.count++;
    groups.set(key, g);
  }

  const list = (view === "reviewed" ? reviewed : unreviewed)
    .filter((r) => !draft || r.draft_basis === draft)
    .filter((r) => !source || r.draft_source === source)
    .sort(
      (a, b) =>
        rightsReviewRank(a.books?.title) - rightsReviewRank(b.books?.title) ||
        (a.books?.title ?? "").localeCompare(b.books?.title ?? "") ||
        a.book_id.localeCompare(b.book_id),
    );
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);
  const rows: UIRightsRow[] = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => ({
    bookId: r.book_id,
    title: r.books?.title ?? "—",
    slug: r.books?.slug ?? null,
    publisher: r.books?.publisher ?? null,
    author: r.books?.authors?.name ?? null,
    isbn: r.books?.isbn ?? null,
    published: Boolean(r.books?.is_published),
    basis: r.basis,
    draftBasis: r.draft_basis,
    draftSource: r.draft_source,
    evidence: r.evidence,
  }));

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={canReview && undrafted !== null && undrafted > 0 ? <GenerateRightsDrafts pending={undrafted} /> : undefined}
      />

      <p className="rounded-xl border border-info-line bg-info-soft px-4 py-3 text-[13px] leading-6 text-info-text">
        {t("privateNote")}
      </p>

      {(rights.error || bookCount.error) && (
        <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-[13px] text-warning-text">
          {t("errorFailed")}
        </p>
      )}

      <nav className="flex flex-wrap gap-2" aria-label={t("viewsLabel")}>
        {(["unreviewed", "reviewed"] as const).map((v) => (
          <Link
            key={v}
            href={hrefWith({}, { view: v === "unreviewed" ? undefined : v })}
            aria-current={v === view ? "page" : undefined}
            className={`focus-field rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
              v === view ? "border-brand bg-brand text-white" : "border-divider text-text-body hover:border-brand/40"
            }`}
          >
            {t(`view.${v}`, { count: v === "unreviewed" ? unreviewed.length : reviewed.length })}
          </Link>
        ))}
      </nav>

      {view === "unreviewed" && groups.size > 0 && (
        <section aria-labelledby="rights-sets" className="space-y-2">
          <h2 id="rights-sets" className="text-sm font-semibold text-text-heading">
            {t("setsTitle")}
          </h2>
          <ul className="divide-y divide-divider rounded-xl border border-divider bg-bg-surface">
            {[...groups.values()]
              .sort((a, b) => b.count - a.count)
              .map((g) => (
                <li key={`${g.draftBasis}|${g.source}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <Link
                    href={hrefWith({}, { draft: g.draftBasis, source: g.source })}
                    className="focus-field rounded text-sm text-text-body hover:text-brand"
                  >
                    <span className="font-semibold">{t(`basis.${g.draftBasis}`)}</span>{" "}
                    <span className="text-text-muted">· {t(`source.${g.source.replace("rule:", "")}`)}</span>{" "}
                    <span className="tabular-nums text-text-muted">· {g.count}</span>
                  </Link>
                  {canReview && g.draftBasis !== "unknown" && (
                    <BulkConfirmRights draftBasis={g.draftBasis} source={g.source} count={g.count} />
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {(draft || source) && (
        <p className="text-sm text-text-muted">
          {t("filtered", { count: list.length })}{" "}
          <Link href={hrefWith({ view: sp.view }, {})} className="focus-field rounded text-brand">
            {t("clearFilter")}
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={view === "unreviewed" ? t("empty.unreviewed") : t("empty.reviewed")}
          description={undrafted ? t("empty.undrafted", { count: undrafted }) : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <RightsReviewRow key={row.bookId} row={row} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-[13px]" aria-label={t("pagination")}>
          {page > 1 ? <Link href={hrefWith(sp, { page: String(page - 1) })} className="focus-field rounded-sm text-brand">←</Link> : <span />}
          <span className="text-text-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages ? <Link href={hrefWith(sp, { page: String(page + 1) })} className="focus-field rounded-sm text-brand">→</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
