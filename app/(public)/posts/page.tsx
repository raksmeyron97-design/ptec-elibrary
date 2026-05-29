// app/posts/page.tsx
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import PostsListClient from "./PostsListClient";

export const revalidate = 60;

export default async function PostsPage() {
  const supabase = createServiceClient();

  // Only published posts on the public page
  const { data: posts } = await supabase
    .from("posts")
    .select(`
      id,
      title,
      slug,
      category,
      excerpt,
      cover_url,
      created_at,
      author:profiles ( full_name, email )
    `)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const cards = (posts ?? []).map((p: any) => ({
    id:        p.id as string,
    title:     p.title as string,
    slug:      p.slug as string,
    category:  p.category ?? "Other",
    excerpt:   p.excerpt ?? null,
    coverUrl:  p.cover_url ?? null,
    author:    p.author?.full_name ?? p.author?.email ?? "PTEC Library",
    createdAt: p.created_at ?? null,
  }));

  return (
    <section className="min-h-screen bg-bg-body px-6 pb-16 pt-24 md:px-12">
      <div className="mx-auto max-w-[1200px] space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
              PTEC Library
            </p>
            <h1 className="font-serif text-3xl font-bold text-text-heading md:text-4xl">From the Library</h1>
            <p className="mt-2 max-w-2xl font-sans text-sm text-text-muted">
              Research updates, announcements, events, and journals from across the library.
            </p>
          </div>
        </div>

        <PostsListClient posts={cards} />
      </div>
    </section>
  );
}