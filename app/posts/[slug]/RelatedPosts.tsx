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
  Research:     "bg-cyan-50 text-cyan-700",
  Announcement: "bg-violet-50 text-violet-700",
  Event:        "bg-orange-50 text-orange-700",
  Journal:      "bg-blue-50 text-blue-700",
  Other:        "bg-slate-100 text-slate-600",
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
        <div className="h-4 w-1 rounded-full bg-[#007c91]" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
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
              className="group flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md hover:border-slate-200"
            >
              {/* Thumbnail */}
              <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={post.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                    <svg className="h-8 w-8 text-slate-400" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                )}
                {/* Category badge */}
                <span className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-semibold ${categoryStyles[post.category] ?? categoryStyles.Other}`}>
                  {post.category}
                </span>
              </div>

              {/* Text */}
              <div className="flex flex-col gap-1.5 p-3">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 transition group-hover:text-[#007c91]">
                  {post.title}
                </p>
                <p className="text-xs text-slate-400">{formatDate(post.created_at)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}