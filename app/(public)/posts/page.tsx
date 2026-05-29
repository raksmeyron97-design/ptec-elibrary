// app/posts/page.tsx
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import PostsListClient from "./PostsListClient";

export const revalidate = 60;

export default async function PostsPage() {
  // Auth check (createClient) — used only to reveal an admin shortcut bar
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const supabase = createServiceClient();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

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

          {isAdmin && (
            <Link
              href="/admin/posts"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover shadow-sm"
            >
              Manage posts
            </Link>
          )}
        </div>

        <PostsListClient posts={cards} />
      </div>
    </section>
  );
}