// app/posts/[slug]/RelatedPosts.tsx
import Link from "next/link";

interface RelatedPost {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  cover_urls: string[] | null;
  category: string;
  created_at: string | null;
}

const categoryStyles: Record<string, string> = {
  Research:     "bg-brand/5 text-brand border border-blue-100",
  Announcement: "bg-amber-50 text-amber-700 border border-amber-100",
  Event:        "bg-orange-50 text-orange-700 border border-orange-100",
  Journal:      "bg-teal-50 text-teal-700 border border-teal-100",
  Other:        "bg-paper text-text-muted border border-divider",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function RelatedPosts({ posts, category }: { posts: RelatedPost[]; category: string }) {
  if (!posts || posts.length === 0) return null;

  return (
    <aside className="w-full">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="h-4 w-1 rounded-full bg-accent" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Related Posts
        </h2>
      </div>

      <div className="flex flex-col gap-4">
        {posts.map((post) => {
          const thumb =
            Array.isArray(post.cover_urls) && post.cover_urls.length > 0
              ? post.cover_urls[0]
              : post.cover_url ?? null;

          return (
            <Link
              key={post.id}
              href={`/posts/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm transition hover:shadow-md hover:border-brand/30"
            >
              {/* Thumbnail */}
              <div className="relative h-36 w-full overflow-hidden bg-paper">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={post.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-paper to-divider">
                    <svg className="h-8 w-8 text-text-muted" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                )}
                {/* Category badge */}
                <span className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold ${categoryStyles[post.category] ?? categoryStyles.Other}`}>
                  {post.category}
                </span>
              </div>

              {/* Text */}
              <div className="flex flex-col gap-1.5 p-3">
                <p className="line-clamp-2 text-[14px] font-khmer-serif font-bold leading-snug text-text-heading transition group-hover:text-brand">
                  {post.title}
                </p>
                <p className="text-xs text-text-muted font-medium">{formatDate(post.created_at)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}