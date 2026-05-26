// app/home/page.tsx
import Link from "next/link";
import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import BookCard from "@/components/ui/BookCard";
import SearchBar from "@/components/ui/SearchBar";

export const revalidate = 60;

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function getStats() {
  const supabase = createServiceClient();

  const [booksRes, downloadsRes, usersRes, deptsRes] = await Promise.all([
    supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    supabase
      .from("books")
      .select("download_count")
      .eq("is_published", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("books")
      .select("department")
      .eq("is_published", true)
      .not("department", "is", null),
  ]);

  const totalDownloads = (downloadsRes.data ?? []).reduce(
    (sum, b) => sum + (b.download_count ?? 0),
    0
  );
  const uniqueDepts = new Set(
    (deptsRes.data ?? []).map((d) => d.department).filter(Boolean)
  ).size;

  return {
    books:       booksRes.count ?? 0,
    downloads:   totalDownloads,
    users:       usersRes.count ?? 0,
    departments: uniqueDepts,
  };
}

async function getFeaturedBooks() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select(
      `id, title, slug, description, cover_color, cover_url, language,
       published_at, department, pages, isbn, rating, download_count,
       authors(name), categories(name), book_files(format, file_url, file_size_kb)`
    )
    .eq("is_published", true)
    .order("download_count", { ascending: false })
    .limit(5);

  return (data ?? []).map(mapRowToBook);
}

async function getRecentPosts() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("posts")
    .select(
      `id, title, slug, category, excerpt, cover_url, created_at,
       author:profiles(full_name, email)`
    )
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(3);

  return (data ?? []).map((p: any) => ({
    id:        p.id        as string,
    title:     p.title     as string,
    slug:      p.slug      as string,
    category:  (p.category  ?? "Other")         as string,
    excerpt:   (p.excerpt   ?? null)             as string | null,
    coverUrl:  (p.cover_url ?? null)             as string | null,
    author:    (p.author?.full_name ?? p.author?.email ?? "PTEC Library") as string,
    createdAt: (p.created_at ?? null)            as string | null,
  }));
}

async function getDepartmentPills(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select("department")
    .eq("is_published", true)
    .not("department", "is", null)
    .order("department", { ascending: true });

  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (row.department) seen.add(row.department);
  }
  // Show at most 6 pills in the hero
  return [...seen].slice(0, 6);
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── Category badge colours ────────────────────────────────────────────────────

const categoryStyles: Record<string, string> = {
  Research:     "bg-cyan-50 text-cyan-700",
  Announcement: "bg-violet-50 text-violet-700",
  Event:        "bg-orange-50 text-orange-700",
  Journal:      "bg-blue-50 text-blue-700",
  Other:        "bg-slate-100 text-slate-600",
};

const bannerColors = [
  "from-[#0f766e] to-[#0a1629]",
  "from-[#2563eb] to-[#0a1629]",
  "from-[#7c3aed] to-[#0a1629]",
  "from-[#0891b2] to-[#0a1629]",
  "from-[#ca8a04] to-[#0a1629]",
];

function pickBanner(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return bannerColors[Math.abs(hash) % bannerColors.length];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const [stats, featuredBooks, recentPosts, deptPills] = await Promise.all([
    getStats(),
    getFeaturedBooks(),
    getRecentPosts(),
    getDepartmentPills(),
  ]);

  const statItems = [
    { label: "Resources",   value: formatStat(stats.books),       sub: "published books & materials" },
    { label: "Downloads",   value: formatStat(stats.downloads),   sub: "total across all resources"  },
    { label: "Members",     value: formatStat(stats.users),       sub: "registered readers"          },
    { label: "Departments", value: formatStat(stats.departments), sub: "academic departments"        },
  ];

  return (
    <div className="min-h-screen bg-[#F5F6FA]">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white border-b border-slate-100">

        {/* Subtle grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#0a1629 1px,transparent 1px),linear-gradient(90deg,#0a1629 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Accent blobs */}
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-[#007c91]/6 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-[#007c91]/4 blur-2xl" />

        <div className="relative mx-auto max-w-[1400px] px-4 py-16 md:px-12 md:py-24">
          <div className="max-w-2xl">

            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#007c91]">
              PTEC e-Library
            </p>

            <h1 className="font-[family-name:var(--font-angkor)] text-3xl leading-[1.2] tracking-tight text-slate-950 md:text-5xl">
              Cambodia's Digital{" "}
              <span className="text-[#007c91]">Teaching Library</span>
            </h1>

            <p className="mt-5 max-w-lg font-[family-name:var(--font-battambang)] text-[15px] leading-relaxed text-slate-500 md:text-base">
              Access research, textbooks, and educational resources published by
              Phnom Penh Teacher Education College — free for all educators and students.
            </p>

            {/* Search */}
            <div className="mt-8 max-w-xl">
              <Suspense fallback={<div className="h-12 rounded-xl bg-slate-100 animate-pulse" />}>
                <SearchBar />
              </Suspense>
            </div>

            {/* Live department pills */}
            {deptPills.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-400">Browse:</span>
                {deptPills.map((dept) => (
                  <Link
                    key={dept}
                    href={`/books?dept=${encodeURIComponent(dept)}`}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-[#007c91] hover:text-[#007c91]"
                  >
                    {dept}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-[1400px] px-4 md:px-12">
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 md:grid-cols-4 md:divide-y-0">
            {statItems.map(({ label, value, sub }) => (
              <div key={label} className="px-6 py-8 md:px-10">
                <div className="text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">
                  {value}
                </div>
                <div className="mt-1 text-sm font-semibold text-[#007c91]">{label}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Books ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-12 md:py-16">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[#007c91]">
              Most Downloaded
            </p>
            <h2 className="text-2xl font-extrabold text-slate-950 md:text-3xl">
              Featured Resources
            </h2>
          </div>
          <Link
            href="/books?sort=downloads"
            className="shrink-0 text-sm font-semibold text-[#0C7C8A] transition hover:underline"
          >
            View all →
          </Link>
        </div>

        {featuredBooks.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
            No resources published yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {featuredBooks.map((book) => (
              <BookCard key={book.slug} book={book} />
            ))}
          </div>
        )}
      </section>

      {/* ── Posts Preview ─────────────────────────────────────────────────── */}
      {recentPosts.length > 0 && (
        <section className="border-t border-slate-100 bg-white">
          <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-12 md:py-16">
            <div className="mb-7 flex items-end justify-between">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[#007c91]">
                  Latest
                </p>
                <h2 className="text-2xl font-extrabold text-slate-950 md:text-3xl">
                  From the Library
                </h2>
              </div>
              <Link
                href="/posts"
                className="shrink-0 text-sm font-semibold text-[#0C7C8A] transition hover:underline"
              >
                All posts →
              </Link>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  {/* Cover */}
                  {post.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.coverUrl}
                      alt={post.title}
                      className="h-44 w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className={`flex h-44 w-full items-center justify-center bg-gradient-to-br ${pickBanner(post.title)} p-5`}>
                      <span className="line-clamp-3 text-center font-[family-name:var(--font-angkor)] text-lg leading-snug text-white/90">
                        {post.title}
                      </span>
                    </div>
                  )}

                  {/* Body */}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${categoryStyles[post.category] ?? categoryStyles.Other}`}>
                        {post.category}
                      </span>
                    </div>
                    <h3 className="mb-2 line-clamp-2 text-base font-bold leading-snug text-slate-800 transition group-hover:text-[#007c91]">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="mb-4 line-clamp-2 font-[family-name:var(--font-battambang)] text-sm leading-relaxed text-slate-500">
                        {post.excerpt}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between text-xs text-slate-400">
                      <span className="truncate font-medium text-slate-500">{post.author}</span>
                      <span className="shrink-0 tabular-nums">{formatDate(post.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA Banner ────────────────────────────────────────────────────── */}
      <section className="bg-[#0a1629]">
        <div className="mx-auto max-w-[1400px] px-4 py-14 text-center md:px-12 md:py-20">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#19A6B6]">
            Open access for all
          </p>
          <h2 className="font-[family-name:var(--font-angkor)] text-2xl text-white md:text-4xl">
            Ready to explore the catalogue?
          </h2>
          <p className="mx-auto mt-4 max-w-md font-[family-name:var(--font-battambang)] text-sm text-slate-400">
            Hundreds of educational resources — textbooks, research papers, and teaching
            guides — available free to every educator in Cambodia.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/books"
              className="inline-flex h-11 items-center rounded-xl bg-[#007c91] px-7 text-sm font-bold text-white transition hover:bg-[#19A6B6]"
            >
              Browse all resources
            </Link>
            <Link
              href="/about"
              className="inline-flex h-11 items-center rounded-xl border border-white/20 px-7 text-sm font-semibold text-slate-300 transition hover:border-white/40 hover:text-white"
            >
              About PTEC
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}