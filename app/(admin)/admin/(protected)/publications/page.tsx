/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServiceClient } from "@/lib/supabase/server";
import PublicationsClient from "./PublicationsClient";
import Pagination from "@/components/ui/core/Pagination";
import Link from "next/link";
import { Plus, Users } from "lucide-react";

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  page?: string;
  status?: string; // live | draft | ""
  type?: string;   // article | review | account | editorial | ""
};

export default async function AdminPublicationsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const supabase = createServiceClient();

  const page   = Math.max(1, Number(sp.page ?? "1") || 1);
  const q      = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const type   = sp.type ?? "";

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = supabase
    .from("publications_with_stats")
    .select(
      `
      id,
      slug,
      title,
      title_km,
      article_type,
      journal_name,
      volume,
      issue_no,
      doi,
      publication_date,
      is_published,
      published_at,
      download_count,
      view_count,
      cover_url,
      created_at,
      author_names
    `,
      { count: "exact" }
    );

  if (q)    query = query.ilike("title", `%${q}%`);
  if (status === "live")  query = query.eq("is_published", true);
  if (status === "draft") query = query.eq("is_published", false);
  if (type) query = query.eq("article_type", type);

  query = query.order("created_at", { ascending: false });
  query = query.range(from, to);

  const { data: publications, count } = await query;

  const rows = (publications ?? []).map((p: any) => ({
    id:            p.id as string,
    slug:          p.slug as string,
    title:         p.title as string,
    articleType:   p.article_type as string,
    journalName:   p.journal_name as string | null,
    volume:        p.volume as string | null,
    issueNo:       p.issue_no as string | null,
    doi:           p.doi as string | null,
    authorNames:   p.author_names as string | null,
    isPublished:   p.is_published as boolean,
    coverUrl:      p.cover_url as string | null,
    downloadCount: p.download_count ?? 0,
    viewCount:     p.view_count ?? 0,
    createdAt:     p.created_at,
    publicationDate: p.publication_date as string | null,
    publishedAt:   p.published_at as string | null,
  }));

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-heading">Manage Publications</h1>
          <p className="text-text-muted text-sm mt-1">Manage and publish journal articles</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/publications/authors"
            className="inline-flex items-center gap-2 border border-divider text-text-body px-4 py-2 rounded-lg hover:bg-paper transition-colors"
          >
            <Users className="w-4 h-4" />
            Authors
          </Link>
          <Link
            href="/admin/publications/new"
            className="inline-flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Publication
          </Link>
        </div>
      </div>

      <PublicationsClient
        publications={rows}
        filters={{ q, status, type }}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
        searchParams={sp as Record<string, string | undefined>}
        basePath="/admin/publications"
      />
    </div>
  );
}
