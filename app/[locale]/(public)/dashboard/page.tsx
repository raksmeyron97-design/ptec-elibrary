/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSavedBooks } from "@/app/actions/saved-books";
import { getMyReadingLists } from "@/app/actions/reading-lists";
import { getReadingStats } from "@/app/actions/reading-analytics";
import { getNewContentForSubscriptions } from "@/app/actions/subscriptions";
import { getInProgressPaths } from "@/app/actions/learning-paths";
import { getMyBookRequests } from "@/app/actions/book-requests";
import { getMyDownloadHistory } from "@/app/actions/download";
import { buildRecentActivity } from "@/lib/dashboard/recent-activity";
import DashboardHeader, { type GreetingBand } from "@/components/ui/dashboard/DashboardHeader";
import DashboardSearch from "@/components/ui/dashboard/DashboardSearch";
import QuickActions from "@/components/ui/dashboard/QuickActions";
import ContinueReadingHero from "@/components/ui/dashboard/ContinueReadingHero";
import LibrarySnapshot from "@/components/ui/dashboard/LibrarySnapshot";
import MyStats from "@/components/ui/dashboard/MyStats";
import SavedResourcesShelf from "@/components/ui/dashboard/SavedResourcesShelf";
import LearningIntent from "@/components/ui/dashboard/LearningIntent";
import RecentActivity from "@/components/ui/dashboard/RecentActivity";
import UserRequests from "@/components/ui/dashboard/UserRequests";
import ContinueLearningPaths from "@/components/ui/dashboard/ContinueLearningPaths";
import DownloadHistory from "@/components/ui/pwa/DownloadHistory";
import DashboardTabs from "@/components/ui/dashboard/DashboardTabs";
import RecommendedBooks from "@/components/ui/dashboard/RecommendedBooks";
import ExportMyLibrary from "@/components/ui/dashboard/ExportMyLibrary";
import NewForYou from "@/components/ui/dashboard/NewForYou";
import { mapRowToBook } from "@/lib/books";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { Library, BookOpen, Settings, ShieldCheck } from "lucide-react";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";

export const dynamic = "force-dynamic";

type Profile = {
  full_name: string | null;
  email: string;
  role: AppRole;
  avatar_url: string | null;
  created_at: string;
};

/** Server-clock time-of-day band. No per-user timezone is stored anywhere
 *  in this app, so this — like the rest of the codebase — uses the server's
 *  local time rather than the reader's. */
function greetingBand(hour: number): GreetingBand {
  if (hour < 12) return "greetingMorning";
  if (hour < 18) return "greetingAfternoon";
  return "greetingEvening";
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?callbackUrl=${locale === "km" ? "/km" : ""}/dashboard`);

  const BOOK_FIELDS = `id, title, slug, description, cover_url, cover_color,
    department, language, pages, rating,
    authors ( name ), categories ( name ), departments ( name ), book_files ( format, file_url )`;

  const [
    profileResult, savedBooks, progressResult, readingLists, readingStats,
    subAlerts, inProgressPaths, myRequests, downloadHistory,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role, avatar_url, created_at")
      .eq("id", user.id)
      .single<Profile>(),
    getSavedBooks(),
    supabase
      .from("reading_progress")
      .select(`book_id, progress_pct, last_read_at, books ( ${BOOK_FIELDS} )`)
      .eq("user_id", user.id)
      .gt("progress_pct", 0)
      .order("last_read_at", { ascending: false }),
    getMyReadingLists(),
    getReadingStats(),
    getNewContentForSubscriptions().catch(() => []),
    getInProgressPaths().catch(() => []),
    getMyBookRequests().catch(() => []),
    getMyDownloadHistory().catch(() => []),
  ]);

  const profile  = profileResult.data;
  const progress = progressResult.data ?? [];

  const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const googleName   = user.user_metadata?.full_name  || user.user_metadata?.name;
  const avatarUrl    = profile?.avatar_url ?? googleAvatar ?? null;
  const displayName  = profile?.full_name || googleName || profile?.email || user.email || "Reader";
  const isAdmin      = ADMIN_PANEL_ROLES.includes(profile?.role as AppRole);

  const inProgress = progress.filter((p) => p.progress_pct < 100);
  const completed  = progress.filter((p) => p.progress_pct >= 100);

  const inProgressBooks: any[] = inProgress.slice(0, 8).flatMap((p) => {
    if (!p.books) return [];
    return [{ ...mapRowToBook(p.books as any), progressPct: p.progress_pct, lastReadAt: p.last_read_at }];
  });

  const completedBooks: any[] = completed.slice(0, 6).flatMap((p) => {
    if (!p.books) return [];
    return [{ ...mapRowToBook(p.books as any), progressPct: 100 }];
  });

  // Continue Reading hero: the single most-recently-opened in-progress book.
  // `progress` is already ordered by last_read_at desc, so [0] is correct —
  // and this is the ONLY place real progress_pct/last_read_at feed the UI;
  // nothing here is fabricated.
  const heroBook = inProgressBooks[0]
    ? {
        slug: inProgressBooks[0].slug,
        title: inProgressBooks[0].title,
        author: inProgressBooks[0].author,
        category: inProgressBooks[0].category ?? null,
        coverUrl: inProgressBooks[0].coverUrl ?? null,
        progressPct: inProgressBooks[0].progressPct,
        lastReadAt: inProgressBooks[0].lastReadAt ?? null,
      }
    : null;

  const recentActivity = buildRecentActivity({
    progress: progress.map((p) => ({
      last_read_at: p.last_read_at,
      books: p.books ? { slug: (p.books as any).slug, title: (p.books as any).title } : null,
    })),
    savedBooks: savedBooks.map((b) => ({ slug: b.slug, title: b.title, savedAt: b.savedAt })),
    downloadHistory: downloadHistory.map((d) => ({ slug: d.slug, title: d.title, downloadedAt: d.downloadedAt })),
  });

  const accountFields = [
    { label: t("labelFullName"),    value: profile?.full_name || "—" },
    { label: t("labelEmail"),       value: profile?.email ?? user.email ?? "—" },
    { label: t("labelRole"),        value: profile?.role ?? "reader" },
  ];

  return (
    <div className="min-h-screen bg-bg-body">
      <DashboardHeader
        displayName={displayName}
        email={profile?.email ?? user.email ?? ""}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
        greetingBand={greetingBand(new Date().getHours())}
      />

      <NewForYou alerts={subAlerts} />

      <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-8 md:px-12">

        {/* ── First viewport: identity (header, above) + search + Continue Reading + snapshot ── */}
        <div className="space-y-5">
          <DashboardSearch />
          <QuickActions />
          <ContinueReadingHero book={heroBook} />
          <LibrarySnapshot
            saved={savedBooks.length}
            inProgress={inProgress.length}
            downloads={downloadHistory.length}
          />
        </div>

        {/* ── My Stats: full-width, own responsive grid — needs more room
             than the narrowed flex-1 column below would give it ── */}
        <div className="mt-10">
          <MyStats stats={readingStats} />
        </div>

        {/* ── Secondary / tertiary content — reached by scrolling ── */}
        <div className="mt-10 flex gap-8 lg:items-start">
          <div className="min-w-0 flex-1 space-y-10">
            <SavedResourcesShelf savedBooks={savedBooks as any} />
            <RecommendedBooks viewAllHref="/books" />
            <LearningIntent />
            <RecentActivity items={recentActivity} />
            <UserRequests requests={myRequests} locale={locale} />

            <div id="library" className="scroll-mt-6 pt-2">
              <h2 className="mb-4 text-[15px] font-bold text-text-heading">{t("myLibrary")}</h2>
              <DashboardTabs
                inProgressBooks={inProgressBooks}
                completedBooks={completedBooks}
                savedBooks={savedBooks as any}
                readingLists={readingLists}
                totalInProgress={inProgress.length}
                totalCompleted={completed.length}
              />
            </div>
          </div>

          {/* ── Right: sticky sidebar ── */}
          <aside className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-20 space-y-4">
              <ContinueLearningPaths paths={inProgressPaths} />

              <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">{t("quickLinks")}</p>
                <nav className="flex flex-col gap-1" aria-label={t("quickLinks")}>
                  {[
                    { href: "/books",             icon: <Library className="h-4 w-4" />,    label: t("linkBrowseLibrary") },
                    { href: "/theses",            icon: <BookOpen className="h-4 w-4" />,    label: t("linkTheses") },
                    { href: "/dashboard/settings",icon: <Settings className="h-4 w-4" />,    label: t("settings") },
                  ].map((l) => (
                    <Link key={l.href} href={l.href}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-text-body transition hover:bg-paper hover:text-brand">
                      <span className="text-text-muted">{l.icon}</span>
                      {l.label}
                    </Link>
                  ))}
                  {isAdmin && (
                    <NextLink href="/admin"
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-text-body transition hover:bg-paper hover:text-brand">
                      <span className="text-text-muted"><ShieldCheck className="h-4 w-4" /></span>
                      {t("linkAdminPanel")}
                    </NextLink>
                  )}
                  <ExportMyLibrary />
                </nav>
              </div>

              <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">{t("accountInfo")}</p>
                <div className="flex flex-col gap-2.5">
                  {accountFields.map(({ label, value }) => (
                    <div key={label} className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted/70">{label}</p>
                      <p className="truncate text-[12.5px] font-semibold text-text-heading">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">{t("recentDownloads")}</p>
                <DownloadHistory history={downloadHistory} />
              </div>
            </div>
          </aside>
        </div>

        {/* Mobile: sidebar content below main content */}
        <div className="mt-8 lg:hidden space-y-4">
          <ContinueLearningPaths paths={inProgressPaths} />
          <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">{t("accountInfo")}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {accountFields.map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-divider bg-paper px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
                  <p className="mt-0.5 truncate text-[12px] font-semibold text-text-heading">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">{t("recentDownloads")}</p>
            <DownloadHistory history={downloadHistory} />
          </div>
        </div>
      </div>
    </div>
  );
}
