// app/admin/posts/page.tsx
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import PostsClient from "./PostsClient";

export default async function AdminPostsPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/admin/posts");

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/books");

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
    <section className="min-h-screen bg-slate-50 px-4 py-8 md:px-10">
      <div className="mx-auto max-w-[1200px] space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl bg-[#0a1629] p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">
              Admin · Posts
            </p>
            <h1 className="font-[family-name:var(--font-angkor)] text-2xl md:text-3xl">Manage Posts</h1>
            <p className="mt-1 text-sm text-slate-400">
              {rows.length} post{rows.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="inline-flex h-10 items-center rounded-lg border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              ← Admin
            </Link>
            <Link
              href="/admin/posts/new"
              className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-cyan-50"
            >
              + New Post
            </Link>
          </div>
        </div>

        {/* Client-side table with search + filter + pagination */}
        <PostsClient posts={rows} />

      </div>
    </section>
  );
}