// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import BookCard from "@/components/ui/books/BookCard";
import Icon, { type IconName } from "@/components/ui/core/Icon";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getSavedBooks } from "@/app/actions/saved-books";
import DownloadHistory from "@/components/ui/pwa/DownloadHistory";
import Image from "next/image";
import { mapRowToBook } from "@/lib/books";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("dashboard");
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

  const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const googleName   = user.user_metadata?.full_name  || user.user_metadata?.name;

  const avatarUrl   = profile?.avatar_url ?? googleAvatar ?? null;
  const displayName = profile?.full_name || googleName || profile?.email || user.email || "Reader";
  const initials    = getInitials(profile?.full_name ?? googleName ?? null, profile?.email ?? user.email ?? "");
  const isAdmin     = profile?.role === "admin";

  const inProgress = progress.filter((p) => p.progress_pct < 100);
  const completed  = progress.filter((p) => p.progress_pct >= 100);

  const BOOK_FIELDS = `id, title, slug, description, cover_url, cover_color,
    department, language, pages, rating,
    authors ( name ), categories ( name ), departments ( name ), book_files ( format, file_url )`;

  // Fetch in-progress books
  const inProgressIds = inProgress.slice(0, 6).map((p) => p.book_id);
  let inProgressBooks: any[] = [];
  if (inProgressIds.length > 0) {
    const { data: booksData } = await db.from("books").select(BOOK_FIELDS).in("id", inProgressIds);
    inProgressBooks = (booksData ?? []).map((b: any) => {
      const prog = progress.find((p) => p.book_id === b.id);
      return { ...mapRowToBook(b), progressPct: prog?.progress_pct ?? 0 };
    });
  }

  // Fetch completed books
  const completedIds = completed.slice(0, 6).map((p) => p.book_id);
  let completedBooks: any[] = [];
  if (completedIds.length > 0) {
    const { data: booksData } = await db.from("books").select(BOOK_FIELDS).in("id", completedIds);
    completedBooks = (booksData ?? []).map((b: any) => ({ ...mapRowToBook(b), progressPct: 100 }));
  }

  const stats: { label: string; value: number; icon: IconName; href: string; color: string }[] = [
    { label: t("statSaved"),      value: savedBooks.length, icon: "bookmark",   href: "#saved",       color: "text-brand"       },
    { label: t("statInProgress"), value: inProgress.length, icon: "file-check", href: "#in-progress", color: "text-accent"      },
    { label: t("statCompleted"),  value: completed.length,  icon: "calendar",   href: "#completed",   color: "text-emerald-600" },
  ];

  const accountFields = [
    { label: t("labelFullName"),    value: profile?.full_name || "—" },
    { label: t("labelEmail"),       value: profile?.email ?? user.email ?? "—" },
    { label: t("labelRole"),        value: profile?.role ?? "reader" },
    { label: t("labelMemberSince"), value: profile?.created_at ? formatDate(profile.created_at) : "—" },
    { label: t("labelUserId"),      value: user.id.slice(0, 8) + "…" },
    { label: t("labelStatus"),      value: t("statusActive") },
  ];

  return (
    <section className="min-h-screen bg-paper px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <div className="mx-auto max-w-[1400px] space-y-5 sm:space-y-8">

        {/* ── Profile Hero Card ── */}
        <div className="relative overflow-hidden rounded-2xl border-t-4 border-t-accent bg-gradient-to-br from-blue-900 to-blue-950 p-5 sm:p-8 text-white shadow-lg">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 left-1/3 h-48 w-48 rounded-full bg-bg-surface/5 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-full overflow-hidden ring-4 ring-white/20">
                    <Image src={avatarUrl} alt={displayName} fill sizes="80px" className="object-cover" />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-brand ring-4 ring-gold-500/30">
                    <span className="font-khmer-serif text-xl sm:text-2xl font-bold tracking-wide">{initials}</span>
                  </div>
                )}
                <span className="absolute bottom-1 right-1 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-blue-950 bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-khmer-serif text-xl sm:text-2xl font-bold truncate">{displayName}</h1>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isAdmin ? "bg-gold-400/20 text-gold-200" : "bg-blue-400/20 text-blue-100"
                  }`}>
                    {isAdmin ? t("admin") : t("reader")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-blue-200 truncate">{profile?.email ?? user.email}</p>
                {profile?.created_at && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-blue-300">
                    <Icon name="calendar" className="text-sm shrink-0" />
                    {t("memberSince")} {formatDate(profile.created_at)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 sm:gap-3 sm:flex-wrap">
              <Link
                href="/books"
                className="flex-1 sm:flex-none inline-flex h-9 sm:h-10 items-center justify-center gap-2 rounded-lg bg-bg-surface/10 px-3 sm:px-4 text-sm font-semibold text-white transition hover:bg-bg-surface/20"
              >
                <Icon name="library" className="text-base" />
                <span>{t("browse")}</span>
              </Link>
              <form action="/auth/signout" method="POST" className="flex-1 sm:flex-none">
                <button
                  type="submit"
                  className="w-full h-9 sm:h-10 inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3 sm:px-4 text-sm font-semibold text-blue-200 transition hover:border-white/40 hover:text-white"
                >
                  {t("signOut")}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {stats.map(({ label, value, icon, href, color }) => (
            <a
              key={label}
              href={href}
              className="group relative overflow-hidden rounded-xl border border-divider bg-bg-surface p-3 sm:p-6 shadow-sm transition hover:border-brand/40 hover:shadow-md"
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
              <div className="flex items-center justify-between">
                <Icon name={icon} className={`text-xl sm:text-3xl ${color}`} />
                <span className="hidden sm:flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-text-muted transition group-hover:text-brand">
                  {t("view")}
                  <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <div className="mt-2 sm:mt-4 font-khmer-serif text-2xl sm:text-4xl font-bold text-text-heading">{value}</div>
              <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-text-muted leading-tight">{label}</div>
            </a>
          ))}
        </div>

        {/* ── In Progress ── */}
        <div id="in-progress" className="scroll-mt-6">
          <div className="mb-4 sm:mb-5 flex items-center justify-between">
            <h2 className="font-khmer-serif text-lg sm:text-xl font-bold text-text-heading">
              {t("continueReading")}
              {inProgressBooks.length > 0 && (
                <span className="ml-2 text-sm sm:text-base font-normal text-text-muted">({inProgressBooks.length})</span>
              )}
            </h2>
          </div>
          {inProgressBooks.length === 0 ? (
            <EmptySection icon="file-check" title={t("noInProgressTitle")} description={t("noInProgressDesc")} browseCatalogue={t("browseCatalogue")} />
          ) : (
            <div className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
              {inProgressBooks.map((book) => <BookCard key={book.slug} book={book} />)}
            </div>
          )}
        </div>

        {/* ── Completed ── */}
        <div id="completed" className="scroll-mt-6">
          <div className="mb-4 sm:mb-5 flex items-center justify-between">
            <h2 className="font-khmer-serif text-lg sm:text-xl font-bold text-text-heading">
              {t("completedHeading")}
              {completedBooks.length > 0 && (
                <span className="ml-2 text-sm sm:text-base font-normal text-text-muted">({completedBooks.length})</span>
              )}
            </h2>
          </div>
          {completedBooks.length === 0 ? (
            <EmptySection icon="calendar" title={t("noCompletedTitle")} description={t("noCompletedDesc")} browseCatalogue={t("browseCatalogue")} />
          ) : (
            <div className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
              {completedBooks.map((book) => <BookCard key={book.slug} book={book} />)}
            </div>
          )}
        </div>

        {/* ── Saved books ── */}
        <div id="saved" className="scroll-mt-6">
          <div className="mb-4 sm:mb-5 flex items-center justify-between">
            <h2 className="font-khmer-serif text-lg sm:text-xl font-bold text-text-heading">
              {t("savedHeading")}
              {savedBooks.length > 0 && (
                <span className="ml-2 text-sm sm:text-base font-normal text-text-muted">({savedBooks.length})</span>
              )}
            </h2>
            {savedBooks.length > 0 && (
              <Link href="/books" className="shrink-0 ml-2 text-sm font-semibold text-brand hover:text-brand-hover hover:underline">
                {t("browseMore")} →
              </Link>
            )}
          </div>
          {savedBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-bg-surface py-10 sm:py-16 text-center px-4">
              <Icon name="bookmark" className="mb-3 text-4xl sm:text-5xl text-text-muted/40" />
              <h3 className="text-sm sm:text-base font-semibold text-text-heading">{t("noSavedTitle")}</h3>
              <p className="mt-1 text-xs sm:text-sm text-text-muted max-w-xs">{t("noSavedDesc")}</p>
              <Link href="/books" className="mt-4 sm:mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover">
                {t("browseCatalogue")}
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {savedBooks.map((book) => (
                <BookCard key={book.slug} book={{ ...book, format: (book.format ?? "PDF") as "PDF" | "Print" | "Audio" | "Video" }} />
              ))}
            </div>
          )}
        </div>

        {/* ── Account info ── */}
        <div className="rounded-xl border border-divider bg-bg-surface p-4 sm:p-6 shadow-sm">
          <h2 className="mb-3 sm:mb-4 font-khmer-serif text-base sm:text-lg font-bold text-text-heading">{t("accountInfo")}</h2>
          <div className="grid gap-2 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
            {accountFields.map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-paper border border-divider px-3 py-2 sm:px-4 sm:py-3">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
                <p className="mt-0.5 sm:mt-1 truncate text-xs sm:text-sm font-semibold text-text-heading">{value}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

function EmptySection({
  icon, title, description, browseCatalogue,
}: {
  icon: IconName;
  title: string;
  description: string;
  browseCatalogue: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-bg-surface py-8 sm:py-12 text-center px-4">
      <Icon name={icon} className="mb-3 text-3xl sm:text-4xl text-text-muted/40" />
      <h3 className="text-sm font-semibold text-text-heading">{title}</h3>
      <p className="mt-1 mb-4 max-w-xs text-xs text-text-muted">{description}</p>
      <Link href="/books" className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-xs font-semibold text-brand-contrast transition hover:bg-brand-hover">
        {browseCatalogue}
      </Link>
    </div>
  );
}
