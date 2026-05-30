// app/admin/posts/page.tsx
import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import PostsClient from "./PostsClient";

export default async function AdminPostsPage() {
  const supabase = createServiceClient();

  // Fetch ALL posts (drafts included) with author name
  const { data: posts } = await supabase
    .from("posts")
    .select(`
      id,
      title,
      slug,
      category,
      is_published,
      views,
      created_at,
      author:profiles ( full_name, email )
    `)
    .order("created_at", { ascending: false });

  const rows = (posts ?? []).map((p: any) => ({
    id:          p.id as string,
    title:       p.title as string,
    slug:        p.slug as string,
    category:    p.category ?? "Other",
    author:      p.author?.full_name ?? p.author?.email ?? "—",
    isPublished: p.is_published as boolean,
    views:       p.views ?? 0,
    createdAt:   p.created_at ?? null,
  }));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manage Posts</h1>
          <p className="text-sm text-slate-500">Create, edit, and publish your library posts.</p>
        </div>
        <Link
          href="/admin/posts/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1E3A8A] px-4 text-sm font-semibold text-white transition hover:bg-[#1E3A8A]/90 shadow-sm"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Post
        </Link>
      </div>

      {/* Client-side table with search + filter + pagination */}
      <PostsClient posts={rows} />
    </div>
  );
}