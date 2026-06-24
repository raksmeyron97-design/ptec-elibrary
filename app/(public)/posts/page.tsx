/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import PostsListClient from "./PostsListClient";
import { getTranslations } from 'next-intl/server';
import { SITE_URL } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "News & Events",
  description: "Latest news, announcements, events, and activities from the Phnom Penh Teacher Education College (PTEC) Library.",
  alternates: {
    canonical: `${SITE_URL}/posts`,
  },
  openGraph: {
    title: "News & Events | PTEC Library",
    description: "Latest news, announcements, and events from PTEC.",
    url: `${SITE_URL}/posts`,
    type: "website",
  },
};

export default async function PostsPage() {
  const t = await getTranslations('posts');
  const tNav = await getTranslations('nav');
  const supabase = await createClient();

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
    <div>
      {/* Page banner */}
      <div className="bg-gradient-to-b from-blue-800 to-blue-700 text-white">
        <div className="mx-auto max-w-[1180px] px-5 py-12">
          <div className="flex items-center gap-2 text-sm text-blue-200 mb-4">
            <Link href="/" className="hover:text-amber-300 transition-colors">
              {tNav('home')}
            </Link>
            <span className="opacity-50">›</span>
            <span className="text-amber-300">{t('title')}</span>
          </div>
          <h1 className="font-khmer-serif font-bold text-[clamp(30px,5vw,46px)] leading-snug m-0">
            {t('title')}
          </h1>
          <p className="mt-3 text-lg text-blue-100 max-w-[620px] leading-snug">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <PostsListClient posts={cards} />
    </div>
  );
}
