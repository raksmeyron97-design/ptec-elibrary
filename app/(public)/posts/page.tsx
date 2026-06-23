/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/posts/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import PostsListClient from "./PostsListClient";
import { getTranslations } from 'next-intl/server';
import { SITE_URL } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "News & Announcements",
  description: "Latest news, announcements, events, and research updates from the Phnom Penh Teacher Education College (PTEC).",
  alternates: {
    canonical: `${SITE_URL}/posts`,
  },
  openGraph: {
    title: "News & Announcements | PTEC Library",
    description: "Latest news, announcements, and events from PTEC.",
    url: `${SITE_URL}/posts`,
    type: "website",
  },
};

export default async function PostsPage() {
  const t = await getTranslations('posts');
  const supabase = await createClient();

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
    <section className="min-h-screen bg-bg-body px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-10 md:px-12">
      <div className="mx-auto max-w-[1400px] space-y-6 sm:space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1.5 sm:mb-2 text-xs font-bold uppercase tracking-widest text-accent">
              {t('eyebrow')}
            </p>
            <h1 className="font-khmer-serif text-2xl sm:text-3xl font-bold leading-[1.4] sm:leading-[1.5] text-text-heading md:text-4xl">{t('title')}</h1>
            <p className="mt-1.5 sm:mt-2 max-w-2xl font-sans text-sm leading-[1.7] text-text-muted">
              {t('subtitle')}
            </p>
          </div>
        </div>

        <PostsListClient posts={cards} />
      </div>
    </section>
  );
}