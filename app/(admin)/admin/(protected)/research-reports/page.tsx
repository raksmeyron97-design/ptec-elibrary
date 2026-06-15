/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createServiceClient } from "@/lib/supabase/server";
import ResearchReportsClient from "./ResearchReportsClient";
import Pagination from "@/components/ui/core/Pagination";
import Link from "next/link";
import { Plus } from "lucide-react";

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  page?: string;
  dept?: string;
  status?: string; // live | draft | ""
};

export default async function AdminResearchReportsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const supabase = createServiceClient();

  const page   = Math.max(1, Number(sp.page ?? "1") || 1);
  const q      = (sp.q ?? "").trim();
  const dept   = sp.dept ?? "";
  const status = sp.status ?? "";

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = supabase
    .from("research_reports")
    .select(
      `
      id,
      title,
      is_published,
      download_count,
      view_count,
      program,
      faculty,
      cohort,
      academic_year,
      cover_url,
      created_at,
      doi,
      published_at
    `,
      { count: "exact" }
    );

  if (q)    query = query.ilike("title", `%${q}%`);
  if (status === "live")  query = query.eq("is_published", true);
  if (status === "draft") query = query.eq("is_published", false);

  query = query.order("created_at", { ascending: false });
  query = query.range(from, to);

  const { data: reports, count } = await query;

  const rows = (reports ?? []).map((r: any) => ({
    id:            r.id as string,
    title:         r.title as string,
    program:       r.program as string | null,
    faculty:       r.faculty as string | null,
    cohort:        r.cohort ?? "—",
    academicYear:  r.academic_year ?? "—",
    isPublished:   r.is_published as boolean,
    coverUrl:      r.cover_url as string | null,
    downloadCount: r.download_count ?? 0,
    viewCount:     r.view_count ?? 0,
    createdAt:     r.created_at,
    doi:           r.doi as string | null,
    publishedAt:   r.published_at as string | null,
  }));

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-heading">Research Reports</h1>
          <p className="text-text-muted text-sm mt-1">Manage and publish student research reports</p>
        </div>
        <Link
          href="/admin/research-reports/create"
          className="inline-flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Upload Report
        </Link>
      </div>

      <ResearchReportsClient
        reports={rows}
        currentPage={page}
        pageSize={PAGE_SIZE}
        totalItems={totalItems}
        filters={{ q, status }}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
        searchParams={sp as Record<string, string | undefined>}
        basePath="/admin/research-reports"
      />
    </div>
  );
}
