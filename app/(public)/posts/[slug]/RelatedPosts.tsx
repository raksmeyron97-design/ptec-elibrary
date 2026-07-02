/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

interface RelatedPost {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  cover_urls: string[] | null;
  category: string;
  created_at: string | null;
}

const categoryColors: Record<string, string> = {
  Research:     "text-blue-700",
  Announcement: "text-gold-700",
  Event:        "text-orange-600",
  Journal:      "text-teal-600",
  Other:        "text-text-muted",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("km-KH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function RelatedPosts({ posts, category }: { posts: RelatedPost[]; category: string }) {
  const t = await getTranslations("posts");
  if (!posts || posts.length === 0) return null;

  return (
    <section className="bg-white border-t border-divider">
      <div className="max-w-[1180px] mx-auto px-5 py-12">
        {/* Section header */}
        <div className="flex items-center gap-3 mb-8">
          <span className="w-[5px] h-7 bg-accent rounded-full" />
          <h2 className="font-khmer-serif font-bold text-text-heading text-2xl m-0">
            {t("relatedPosts")}
          </h2>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {posts.map((post) => {
            const thumb =
              Array.isArray(post.cover_urls) && (post.cover_urls as string[]).length > 0
                ? (post.cover_urls as string[])[0]
                : post.cover_url ?? null;

            return (
              <Link
                key={post.id}
                href={`/posts/${post.slug}`}
                className="group flex flex-col bg-white border border-divider rounded-xl overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg text-inherit no-underline"
              >
                {/* Thumbnail */}
                <div className="h-[150px] overflow-hidden flex-none">
                  {thumb ? (
                    <div className="relative w-full h-full">
                      <Image
                        src={thumb}
                        alt={post.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-brand flex items-center justify-center">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v15a2 2 0 00-2-2H2z"/>
                        <path d="M22 5a2 2 0 00-2-2h-6a2 2 0 00-2 2v15a2 2 0 012-2h6z"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col flex-1 p-5">
                  <span className={`text-xs font-bold tracking-wide ${categoryColors[post.category] ?? categoryColors.Other}`}>
                    {t(`category${post.category}` as any)}
                  </span>
                  <h3 className="font-khmer-serif font-bold text-text-heading text-lg leading-snug mt-2 mb-0 transition-colors group-hover:text-brand line-clamp-3">
                    {post.title}
                  </h3>
                  <span className="text-text-muted text-xs mt-auto pt-4">{formatDate(post.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
