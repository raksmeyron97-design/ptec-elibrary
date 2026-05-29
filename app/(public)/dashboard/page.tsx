// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import BookCard from "@/components/ui/BookCard";
import Icon, { type IconName } from "@/components/ui/Icon";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getSavedBooks } from "@/app/actions/saved-books";
import DownloadHistory from "@/components/ui/DownloadHistory";
export const dynamic = "force-dynamic";

type Profile = {
  full_name: string | null;
  email: string;
  role: "reader" | "admin";
  avatar_url: string | null;
  created_at: string;
};

function getInitials(name: string | null, email: string) {
  if (name) return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/dashboard");

  const db = createServiceClient();

  const [profileResult, savedBooks, progressResult] = await Promise.all([
    db
      .from("profiles")
      .select("full_name, email, role, avatar_url, created_at")
      .eq("id", user.id)
      .single<Profile>(),
    getSavedBooks(),
    db
      .from("reading_progress")
      .select("book_id, progress_pct, last_read_at")
      .eq("user_id", user.id)
      .gt("progress_pct", 0)
      .order("last_read_at", { ascending: false }),
  ]);

  const profile  = profileResult.data;
  const progress = progressResult.data ?? [];

  const displayName = profile?.full_name || profile?.email || user.email || "Reader";
  const initials    = getInitials(profile?.full_name ?? null, profile?.email ?? user.email ?? "");
  const isAdmin     = profile?.role === "admin";

  const inProgress = progress.filter(p => p.progress_pct < 100);
  const completed  = progress.filter(p => p.progress_pct >= 100);

  // Fetch in-progress books
  const inProgressIds = inProgress.slice(0, 6).map((p) => p.book_id);
  let inProgressBooks: any[] = [];
  if (inProgressIds.length > 0) {
    const { data: booksData } = await db
      .from("books")
      .select(`id, title, slug, description, cover_url, cover_color,
        department, language, pages, rating,
        authors ( name ), categories ( name ), book_files ( format, file_url )`)
      .in("id", inProgressIds);

    inProgressBooks = (booksData ?? []).map((b: any) => {
      const prog    = progress.find((p) => p.book_id === b.id);
      const pdfFile = b.book_files?.find((f: any) => f.format === "pdf");
      return {
        slug: b.slug, title: b.title,
        author: b.authors?.name ?? "Unknown",
        isbn: "N/A", department: b.department ?? "General",
        category: b.categories?.name ?? "General",
        language: b.language ?? "English",
        year: new Date().getFullYear(),
        format: "PDF" as const, availability: "Digital" as const,
        rating: Number(b.rating) || 0, pages: b.pages ?? 1,
        summary: b.description ?? "",
        cover: b.cover_color ?? "bg-[#0a1629]",
        coverUrl: b.cover_url ?? null,
        pdfUrl: pdfFile?.file_url ?? null,
        tags: [], progressPct: prog?.progress_pct ?? 0,
      };
    });
  }

  // Fetch completed books
  const completedIds = completed.slice(0, 6).map((p) => p.book_id);
  let completedBooks: any[] = [];
  if (completedIds.length > 0) {
    const { data: booksData } = await db
      .from("books")
      .select(`id, title, slug, description, cover_url, cover_color,
        department, language, pages, rating,
        authors ( name ), categories ( name ), book_files ( format, file_url )`)
      .in("id", completedIds);

    completedBooks = (booksData ?? []).map((b: any) => {
      const pdfFile = b.book_files?.find((f: any) => f.format === "pdf");
      return {
        slug: b.slug, title: b.title,
        author: b.authors?.name ?? "Unknown",
        isbn: "N/A", department: b.department ?? "General",
        category: b.categories?.name ?? "General",
        language: b.language ?? "English",
        year: new Date().getFullYear(),
        format: "PDF" as const, availability: "Digital" as const,
        rating: Number(b.rating) || 0, pages: b.pages ?? 1,
        summary: b.description ?? "",
        cover: b.cover_color ?? "bg-[#0a1629]",
        coverUrl: b.cover_url ?? null,
        pdfUrl: pdfFile?.file_url ?? null,
        tags: [], progressPct: 100,
      };
    });
  }

  const stats: { label: string; value: number; icon: IconName; href: string; color: string }[] = [
    { label: "Saved Resources",   value: savedBooks.length,  icon: "bookmark",   href: "#saved",       color: "text-[#007c91]" },
    { label: "Books in Progress", value: inProgress.length,  icon: "file-check", href: "#in-progress", color: "text-amber-500" },
    { label: "Completed Books",   value: completed.length,   icon: "calendar",   href: "#completed",   color: "text-emerald-600" },
  ];

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[1200px] space-y-8">

        {/* ── Profile Hero Card ── */}
        <div className="relative overflow-hidden rounded-2xl bg-[#0a1629] p-8 text-white shadow-lg">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#007c91]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 left-1/3 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt={displayName}
                    className="h-20 w-20 rounded-full object-cover ring-4 ring-white/20" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#007c91] ring-4 ring-white/20">
                    <span className="text-2xl font-bold tracking-wide">{initials}</span>
                  </div>
                )}
                <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[#0a1629] bg-emerald-400" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold">{displayName}</h1>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isAdmin ? "bg-amber-400/20 text-amber-300" : "bg-cyan-400/20 text-cyan-300"
                  }`}>
                    {isAdmin ? "Admin" : "Reader"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{profile?.email ?? user.email}</p>
                {profile?.created_at && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Icon name="calendar" className="text-sm" />
                    Member since {formatDate(profile.created_at)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">

              <Link href="/books"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/20">
                <Icon name="library" className="text-base" />Browse Catalogue
              </Link>
              <form action="/auth/signout" method="POST">
                <button type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 px-4 text-sm font-semibold text-slate-300 transition hover:border-white/40 hover:text-white">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ── Stat cards — clickable ── */}
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map(({ label, value, icon, href, color }) => (
            <a
              key={label}
              href={href}
              className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-[#007c91]/40 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <Icon name={icon} className={`text-3xl ${color}`} />
                <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400 transition group-hover:text-[#007c91]">
                  View
                  <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
              <div className="mt-4 text-4xl font-bold text-slate-950">{value}</div>
              <div className="mt-1 text-sm text-slate-500">{label}</div>
            </a>
          ))}
        </div>

        {/* ── In Progress ── */}
        <div id="in-progress" className="scroll-mt-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-950">
              Continue Reading
              {inProgressBooks.length > 0 && (
                <span className="ml-2 text-base font-normal text-slate-400">({inProgressBooks.length})</span>
              )}
            </h2>
          </div>
          {inProgressBooks.length === 0 ? (
            <EmptySection
              icon="file-check"
              title="No books in progress"
              description="Start reading a book and your progress will appear here."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {inProgressBooks.map((book) => (
                <BookCard key={book.slug} book={book} />
              ))}
            </div>
          )}
        </div>

        {/* ── Completed ── */}
        <div id="completed" className="scroll-mt-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-950">
              Completed Books
              {completedBooks.length > 0 && (
                <span className="ml-2 text-base font-normal text-slate-400">({completedBooks.length})</span>
              )}
            </h2>
          </div>
          {completedBooks.length === 0 ? (
            <EmptySection
              icon="calendar"
              title="No completed books yet"
              description="Books you finish reading (100%) will show up here."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {completedBooks.map((book) => (
                <BookCard key={book.slug} book={book} />
              ))}
            </div>
          )}
        </div>

        {/* ── Saved books ── */}
        <div id="saved" className="scroll-mt-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-950">
              Saved Resources
              {savedBooks.length > 0 && (
                <span className="ml-2 text-base font-normal text-slate-400">({savedBooks.length})</span>
              )}
            </h2>
            {savedBooks.length > 0 && (
              <Link href="/books" className="text-sm font-semibold text-[#0C7C8A] hover:underline">
                Browse more →
              </Link>
            )}
          </div>
          {savedBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <Icon name="bookmark" className="mb-3 text-5xl text-slate-300" />
              <h3 className="text-base font-semibold text-slate-700">No saved resources yet</h3>
              <p className="mt-1 text-sm text-slate-400">Browse the catalogue and save books you want to read.</p>
              <Link href="/books"
                className="mt-5 inline-flex h-10 items-center rounded-lg bg-[#0a1629] px-5 text-sm font-semibold text-white transition hover:bg-[#007c91]">
                Browse Catalogue
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {savedBooks.map((book) => (
                <BookCard key={book.slug} book={{ ...book, format: (book.format ?? "PDF") as "PDF" | "Print" | "Audio" | "Video" }} />
              ))}
            </div>
          )}
        </div>

        {/* ── Account info ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-950">Account Information</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Full Name",    value: profile?.full_name || "—" },
              { label: "Email",        value: profile?.email ?? user.email ?? "—" },
              { label: "Role",         value: profile?.role ?? "reader" },
              { label: "Member Since", value: profile?.created_at ? formatDate(profile.created_at) : "—" },
              { label: "User ID",      value: user.id.slice(0, 8) + "…" },
              { label: "Status",       value: "Active" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

function EmptySection({
  icon, title, description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
      <Icon name={icon} className="mb-3 text-4xl text-slate-300" />
      <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
      <p className="mt-1 max-w-xs text-xs text-slate-400">{description}</p>
    </div>
  );
}
