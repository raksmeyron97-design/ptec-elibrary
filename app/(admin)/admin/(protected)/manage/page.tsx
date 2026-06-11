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
      cover_url,
      is_published,
      download_count,
      department,
      published_at,
      authors ( name ),
      categories ( name ),
      ${dept ? "departments!inner(name)" : "departments(name)"},
      book_files ( file_size_kb )
    `,
      { count: "exact" }
    );

  // ── Filters (done in the DB) ──
  if (q)    query = query.ilike("title", `%${q}%`);
  if (dept) query = query.eq("departments.name", dept);
  if (status === "live")  query = query.eq("is_published", true);
  if (status === "draft") query = query.eq("is_published", false);

  // ── Sort (done in the DB) ──
  switch (sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    case "downloads":
      query = query.order("download_count", { ascending: false });
      break;
    case "department":
      query = query.order("name", { referencedTable: "departments", ascending: true });
      break;
    case "category":
      query = query.order("name", { referencedTable: "categories", ascending: true });
      break;
    case "newest":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  // Stable tie-breaker so rows don't shuffle / duplicate across pages.
  query = query.order("id", { ascending: true });

  // Pagination MUST come after ordering.
  query = query.range(from, to);

  const { data: books, count, error: booksError } = await query;
  if (booksError) console.error("[ManageBooks] query error:", booksError.message, booksError.details);

  const rows = (books ?? []).map((b: any) => ({
    id:            b.id as string,
    title:         b.title as string,
    slug:          b.slug as string,
    coverUrl:      b.cover_url as string | null,
    author:        b.authors?.name ?? "—",
    category:      b.categories?.name ?? "—",
    department:    b.departments?.name ?? b.department ?? "—",
    language:      b.language ?? "—",
    year:          b.published_at ? new Date(b.published_at).getFullYear() : null,
    isPublished:   b.is_published as boolean,
    fileSizeKb:    b.book_files?.[0]?.file_size_kb ?? null,
    downloadCount: b.download_count ?? 0,
  }));

  // ── Department options for the filter dropdown ──
  const { data: deptRows } = await supabase
    .from("departments")
    .select("name")
    .order("name", { ascending: true });

  const departments = (deptRows ?? []).map((d: any) => d.name);

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      {booksError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Database error:</strong> {booksError.message}
          {booksError.details && <span className="ml-2 text-xs opacity-80">({booksError.details})</span>}
        </div>
      )}
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