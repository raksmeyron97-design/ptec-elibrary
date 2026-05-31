import { createServiceClient } from "@/lib/supabase/server";
import LatestPosts from "./LatestPosts";

async function getRecentPosts() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("posts")
    .select(`id, title, slug, category, excerpt, cover_url, created_at, views,
       author:profiles(full_name, email)`)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(4);
  return (data ?? []).map((p: any) => ({
    id: p.id as string,
    title: p.title as string,
    slug: p.slug as string,
    category: (p.category ?? "Other") as string,
    excerpt: (p.excerpt ?? null) as string | null,
    coverUrl: (p.cover_url ?? null) as string | null,
    author: (p.author?.full_name ?? p.author?.email ?? "PTEC Library") as string,
    createdAt: (p.created_at ?? null) as string | null,
    views: (p.views ?? 0) as number,
  }));
}

export default async function LatestPostsSection() {
  const recentPosts = await getRecentPosts();

  return <LatestPosts posts={recentPosts} />;
}
