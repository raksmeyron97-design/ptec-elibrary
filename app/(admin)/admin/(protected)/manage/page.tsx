// app/admin/manage/page.tsx
import { createServiceClient } from "@/lib/supabase/server";
import ManageClient from "./ManageClient";
import Pagination from "@/components/ui/core/Pagination";

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  page?: string;
  sort?: string;   // newest | oldest | title | downloads | department | category
  dept?: string;
  status?: string; // live | draft | ""
};

export default async function ManageBooksPage({
  searchParams,
}: {
  // Next 15: searchParams is a Promise. (On Next 14, remove `Promise<>` and the `await`.)
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const supabase = createServiceClient();

  const page   = Math.max(1, Number(sp.page ?? "1") || 1);
  const q      = (sp.q ?? "").trim();
  const dept   = sp.dept ?? "";
  const status = sp.status ?? "";
  const sort   = sp.sort ?? "newest";

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  // ── Base query (with exact count, so we never fetch all rows just to count) ──
  let query = supabase
    .from("books")
    .select(
      `
      id,
      title,
      slug,
      department,
      language,
      published_at,
      is_published,
      download_count,
      authors ( name ),
      categories ( name ),
      book_files ( file_size_kb )
    `,
      { count: "exact" }
    );

  // ── Filters (done in the DB) ──
  if (q)    query = query.ilike("title", `%${q}%`);
  if (dept) query = query.eq("department", dept);
  if (status === "live")  query = query.eq("is_published", true);
  if (status === "draft") query = query.eq("is_published", false);

  // ── Sort (done in the DB) ──
  switch (sort) {
    case "oldest":
      query = query.order("published_at", { ascending: true, nullsFirst: false });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    case "downloads":
      query = query.order("download_count", { ascending: false });
      break;
    case "department":
      query = query.order("department", { ascending: true, nullsFirst: false });
      break;
    case "category":
      // order by a joined (embedded) column. supabase-js v2 uses `referencedTable`
      // (older versions: `foreignTable`).
      query = query.order("name", { referencedTable: "categories", ascending: true });
      break;
    case "newest":
    default:
      query = query.order("published_at", { ascending: false, nullsFirst: false });
      break;
  }

  // Stable tie-breaker so rows don't shuffle / duplicate across pages.
  query = query.order("id", { ascending: true });

  // Pagination MUST come after ordering.
  query = query.range(from, to);

  const { data: books, count } = await query;

  const rows = (books ?? []).map((b: any) => ({
    id:            b.id as string,
    title:         b.title as string,
    slug:          b.slug as string,
    author:        b.authors?.name ?? "—",
    category:      b.categories?.name ?? "—",
    department:    b.department ?? "—",
    language:      b.language ?? "—",
    year:          b.published_at ? new Date(b.published_at).getFullYear() : null,
    isPublished:   b.is_published as boolean,
    fileSizeKb:    b.book_files?.[0]?.file_size_kb ?? null,
    downloadCount: b.download_count ?? 0,
  }));

  // ── Department options for the filter dropdown ──
  // Reads only the tiny `department` column and dedupes. At very large scale,
  // prefer a Postgres RPC/view that returns DISTINCT department (see notes).
  const { data: deptRows } = await supabase
    .from("books")
    .select("department")
    .not("department", "is", null);

  const departments = Array.from(
    new Set((deptRows ?? []).map((d: any) => d.department).filter(Boolean))
  ).sort();

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <ManageClient
        books={rows}
        departments={departments}
        currentPage={page}
        pageSize={PAGE_SIZE}
        totalItems={totalItems}
        filters={{ q, dept, status, sort }}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
        searchParams={sp as Record<string, string | undefined>}
        basePath="/admin/manage"
      />
    </div>
  );
}