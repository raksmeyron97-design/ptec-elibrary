import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, EmptyState } from "@/components/admin/kit";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { pagedScan } from "@/lib/db/paged-scan";
import { draftKey } from "@/lib/books/classification/draft";
import { rightsReviewRank } from "@/lib/books/rights-draft";
import ClassificationRow, { type UIClassificationRow } from "./_components/ClassificationRow";
import BulkConfirmClassification from "./_components/BulkConfirmClassification";
import GenerateClassificationDrafts from "./_components/GenerateClassificationDrafts";

// Type, grade and part as confirmed data (migration 0175, SEO audit 2026-10
// WI-6). A rule reads the title into a private draft; a librarian edits and
// confirms. Only a confirmation writes the public columns, and no public page
// reads them yet.
export const dynamic = "force-dynamic";

const PAGE = "/admin/data-quality/classification";
const PAGE_SIZE = 25;

type Book = {
  id: string;
  title: string | null;
  slug: string | null;
  resource_type: string | null;
  grade_from: number | null;
  grade_to: number | null;
  part_no: number | null;
  classification_status: string | null;
};
type Draft = {
  book_id: string;
  resource_type: string | null;
  grade_from: number | null;
  grade_to: number | null;
  part_no: number | null;
  rule: string;
};
type SP = { view?: string; key?: string; page?: string };

const href = (sp: SP) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${PAGE}?${s}` : PAGE;
};

export default async function ClassificationPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, can } = await requireRouteAccess("books.classification");
  const [sp, t] = await Promise.all([searchParams, getTranslations("adminDataQuality.classification")]);
  const canReview = can("books.classification.review");

  const [books, drafts] = await Promise.all([
    pagedScan<Book>(
      (from, to) =>
        supabase
          .from("books")
          .select("id, title, slug, resource_type, grade_from, grade_to, part_no, classification_status")
          .order("id")
          .range(from, to),
      50_000,
    ),
    pagedScan<Draft>(
      (from, to) =>
        supabase
          .from("book_classification_drafts")
          .select("book_id, resource_type, grade_from, grade_to, part_no, rule")
          .order("book_id")
          .range(from, to),
      50_000,
    ),
  ]);
  const draftById = new Map(drafts.data.map((d) => [d.book_id, d]));
  const view = sp.view === "confirmed" ? "confirmed" : "drafts";
  const undrafted = books.data.filter((b) => b.classification_status === "none" && !draftById.has(b.id)).length;

  const pending = books.data.filter((b) => b.classification_status === "draft" && draftById.has(b.id));
  const confirmed = books.data.filter((b) => b.classification_status === "confirmed");

  // Sets of IDENTICAL drafts — the only thing bulk confirmation may touch.
  const keyOf = (d: Draft) => draftKey({ resourceType: d.resource_type as never, gradeFrom: d.grade_from, gradeTo: d.grade_to, partNo: d.part_no });
  const sets = new Map<string, { key: string; draft: Draft; count: number }>();
  for (const b of pending) {
    const d = draftById.get(b.id)!;
    const key = keyOf(d);
    const entry = sets.get(key) ?? { key, draft: d, count: 0 };
    entry.count++;
    sets.set(key, entry);
  }

  const list = (view === "confirmed" ? confirmed : pending)
    .filter((b) => !sp.key || (draftById.get(b.id) && keyOf(draftById.get(b.id)!) === sp.key))
    .sort((a, b) => rightsReviewRank(a.title) - rightsReviewRank(b.title) || (a.title ?? "").localeCompare(b.title ?? ""));
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);
  const rows: UIClassificationRow[] = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((b) => {
    const d = draftById.get(b.id);
    const confirmedValues = b.classification_status === "confirmed";
    return {
      bookId: b.id,
      title: b.title ?? "—",
      status: (b.classification_status as UIClassificationRow["status"]) ?? "none",
      rule: d?.rule ?? null,
      resourceType: confirmedValues ? b.resource_type : (d?.resource_type ?? null),
      gradeFrom: confirmedValues ? b.grade_from : (d?.grade_from ?? null),
      gradeTo: confirmedValues ? b.grade_to : (d?.grade_to ?? null),
      partNo: confirmedValues ? b.part_no : (d?.part_no ?? null),
    };
  });
  const describe = (d: Draft) =>
    [
      d.resource_type ? t(`type.${d.resource_type}`) : null,
      d.grade_from !== null ? (d.grade_to !== d.grade_from ? t("gradeRange", { from: d.grade_from, to: d.grade_to ?? d.grade_from }) : t("grade", { n: d.grade_from })) : null,
      d.part_no !== null ? t("part", { n: d.part_no }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={canReview && undrafted > 0 ? <GenerateClassificationDrafts pending={undrafted} /> : undefined}
      />

      {(books.error || drafts.error) && (
        <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-[13px] text-warning-text">
          {t("errorFailed")}
        </p>
      )}

      <nav className="flex flex-wrap gap-2" aria-label={t("viewsLabel")}>
        {(["drafts", "confirmed"] as const).map((v) => (
          <Link
            key={v}
            href={href({ view: v === "drafts" ? undefined : v })}
            aria-current={v === view ? "page" : undefined}
            className={`focus-field rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
              v === view ? "border-brand bg-brand text-white" : "border-divider text-text-body hover:border-brand/40"
            }`}
          >
            {t(`view.${v}`, { count: v === "drafts" ? pending.length : confirmed.length })}
          </Link>
        ))}
      </nav>

      {view === "drafts" && sets.size > 0 && (
        <section aria-labelledby="classification-sets" className="space-y-2">
          <h2 id="classification-sets" className="text-sm font-semibold text-text-heading">
            {t("setsTitle")}
          </h2>
          <ul className="divide-y divide-divider rounded-xl border border-divider bg-bg-surface">
            {[...sets.values()]
              .sort((a, b) => b.count - a.count)
              .slice(0, 30)
              .map((s) => (
                <li key={s.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <Link href={href({ key: s.key })} className="focus-field rounded text-sm text-text-body hover:text-brand">
                    <span className="font-semibold">{describe(s.draft)}</span>{" "}
                    <span className="tabular-nums text-text-muted">· {s.count}</span>
                  </Link>
                  {canReview && s.count > 1 && (
                    <BulkConfirmClassification setKey={s.key} label={describe(s.draft)} count={s.count} />
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {sp.key && (
        <p className="text-sm text-text-muted">
          {t("filtered", { count: list.length })}{" "}
          <Link href={href({ view: sp.view })} className="focus-field rounded text-brand">
            {t("clearFilter")}
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={view === "drafts" ? t("empty.drafts") : t("empty.confirmed")}
          description={undrafted ? t("empty.undrafted", { count: undrafted }) : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <ClassificationRow key={row.bookId} row={row} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-[13px]" aria-label={t("pagination")}>
          {page > 1 ? <Link href={href({ ...sp, page: String(page - 1) })} className="focus-field rounded-sm text-brand">←</Link> : <span />}
          <span className="text-text-muted">{page} / {totalPages}</span>
          {page < totalPages ? <Link href={href({ ...sp, page: String(page + 1) })} className="focus-field rounded-sm text-brand">→</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
