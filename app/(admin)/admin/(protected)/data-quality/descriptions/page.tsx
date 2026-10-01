import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/kit";
import DescriptionReviewRow from "@/components/admin/data-quality/DescriptionReviewRow";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { pagedScan } from "@/lib/db/paged-scan";
import { clusterSizes, templateKey } from "@/lib/seo/description-template";
import { TEMPLATED_CLUSTER_MIN } from "@/lib/seo/description-gate";

// The book description review queue (SEO Phase 5.2). Books whose description
// is missing or repeats a template, most-viewed first, each with its draft.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const VIEWS = ["templated", "drafts", "all"] as const;
type View = (typeof VIEWS)[number];

type BookRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  language: string | null;
  view_count: number | null;
  description_status?: string | null;
  categories: { name: string | null } | null;
  authors: { name: string | null } | null;
};
type DraftRow = { book_id: string; draft_en: string | null; draft_km: string | null; source: string | null };

const BASE = "id, slug, title, description, language, view_count, categories(name), authors(name)";

async function loadBooks() {
  const supabase = createServiceClient();
  const scan = (columns: string) =>
    pagedScan<BookRow>(
      (from, to) =>
        supabase.from("books").select(columns).eq("is_published", true).order("id", { ascending: true }).range(from, to),
      50_000,
    );
  // 0164's status first; the old projection as the retry, so the page opens
  // (with every book "no draft") before the migration has reached a database.
  let books = await scan(`${BASE}, description_status`);
  if (books.error) books = await scan(BASE);
  const drafts = await pagedScan<DraftRow>(
    (from, to) =>
      supabase.from("book_description_drafts").select("book_id, draft_en, draft_km, source").order("book_id", { ascending: true }).range(from, to),
    50_000,
  );
  return { books: books.data, drafts: drafts.error ? [] : drafts.data, complete: !books.error && !books.truncated };
}

const href = (v: View, p = 1) => `/admin/data-quality/descriptions?view=${v}${p > 1 ? `&page=${p}` : ""}`;

export default async function DescriptionReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  // The guard first: nothing is read for someone the registry refuses.
  await requireRouteAccess("books.descriptions");
  const [sp, t, { books, drafts, complete }] = await Promise.all([
    searchParams,
    getTranslations("adminDataQuality.descriptions"),
    loadBooks(),
  ]);
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "templated";
  const page = Math.max(1, Number(sp.page) || 1);
  const draftsById = new Map(drafts.map((d) => [d.book_id, d]));
  const keyed = books.map((b) => ({
    b,
    key: templateKey(b.description, { title: b.title, subject: b.categories?.name, author: b.authors?.name }),
  }));
  const sizes = clusterSizes(keyed.map((k) => k.key));
  const rows = keyed
    .filter(({ b, key }) => {
      if (view === "drafts") return b.description_status === "draft";
      if (view === "templated") {
        return b.description_status !== "approved" && (key === "empty" || (sizes.get(key) ?? 0) >= TEMPLATED_CLUSTER_MIN);
      }
      return true;
    })
    .sort((a, c) => (c.b.view_count ?? 0) - (a.b.view_count ?? 0) || a.b.id.localeCompare(c.b.id));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  return (
    <div className="w-full space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="flex flex-wrap gap-2" aria-label={t("title")}>
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={href(v)}
            aria-current={v === view ? "page" : undefined}
            className={`focus-field rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
              v === view ? "border-brand bg-brand text-white" : "border-divider text-text-body hover:border-brand/40"
            }`}
          >
            {t(v === "templated" ? "tabTemplated" : v === "drafts" ? "tabDrafts" : "tabAll")}
          </Link>
        ))}
      </nav>
      {!complete && (
        <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-[13px] text-warning-text">
          {t("errorFailed")}
        </p>
      )}
      {pageRows.length === 0 ? (
        <p className="text-[14px] text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {pageRows.map(({ b, key }) => {
            const draft = draftsById.get(b.id);
            return (
              <li key={b.id}>
                <DescriptionReviewRow
                  bookId={b.id}
                  slug={b.slug}
                  title={b.title}
                  views={b.view_count ?? 0}
                  sameTemplate={key === "empty" ? 0 : Math.max(0, (sizes.get(key) ?? 1) - 1)}
                  description={b.description}
                  status={(b.description_status as "none" | "draft" | "approved" | null) ?? "none"}
                  draftEn={draft?.draft_en ?? ""}
                  draftKm={draft?.draft_km ?? ""}
                  draftSource={draft?.source ?? null}
                />
              </li>
            );
          })}
        </ul>
      )}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-[13px]" aria-label="Pagination">
          {page > 1 ? <Link href={href(view, page - 1)} className="focus-field rounded-sm text-brand">←</Link> : <span />}
          <span className="text-text-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages ? <Link href={href(view, page + 1)} className="focus-field rounded-sm text-brand">→</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
