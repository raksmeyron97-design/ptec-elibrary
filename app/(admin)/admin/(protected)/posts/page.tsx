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

      </div>

      {/* Client-side table with search + filter + pagination */}
      <PostsClient posts={rows} />
    </div>
  );
}