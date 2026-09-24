/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { resolveAvatarUrl, resolveFullName } from "@/lib/auth/oauth-avatar";
import { createClient } from "@/lib/supabase/server";
import { getSavedBooks } from "@/app/actions/saved-books";
import { getMyReadingLists } from "@/app/actions/reading-lists";
import { getNewContentForSubscriptions } from "@/app/actions/subscriptions";
import { getInProgressPaths } from "@/app/actions/learning-paths";
import { getMyBookRequests } from "@/app/actions/book-requests";
import { getMyDownloadHistory } from "@/app/actions/download";
import { buildRecentActivity } from "@/lib/dashboard/recent-activity";
import { computeReadingStats, type ReadingProgressRow } from "@/lib/dashboard/reading-stats";
import DashboardHeader, { type GreetingBand } from "@/components/ui/dashboard/DashboardHeader";
import ContinueReadingHero, { type ContinueReadingBook } from "@/components/ui/dashboard/ContinueReadingHero";
import ReadingSummary from "@/components/ui/dashboard/ReadingSummary";
import NewForYou from "@/components/ui/dashboard/NewForYou";
import DashboardTabs from "@/components/ui/dashboard/DashboardTabs";
import DownloadsList from "@/components/ui/dashboard/DownloadsList";
import ExportMyLibrary from "@/components/ui/dashboard/ExportMyLibrary";
import RecommendedBooks from "@/components/ui/dashboard/RecommendedBooks";
import UserRequests from "@/components/ui/dashboard/UserRequests";
import RecentActivity from "@/components/ui/dashboard/RecentActivity";
import LearningIntent from "@/components/ui/dashboard/LearningIntent";
import { SectionHeading } from "@/components/ui/dashboard/primitives";
import { LIBRARY_SECTION_ID } from "@/components/ui/dashboard/library-tab";
import { mapRowToBook } from "@/lib/books";
import { toBookCardData, toBookCardList } from "@/lib/books/card-data";
import { getLocale, getTranslations } from "next-intl/server";
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

/**
 * In-progress rows, newest first, with `last_page` and `last_page_count`
 * (both 0141) when the database has them.
 *
 * Asked for defensively and retried WITHOUT the columns, because this select
 * also carries the embedded book rows the whole "My library" section is built
 * from: on a database that predates 0141 an unknown column fails the entire
 * query, and the dashboard would lose Continue Reading, the shelves and the
 * counts to gain an exact page. The page is the enhancement; everything else
 * is the page.
 */
async function readingProgressRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bookFields: string,
) {
  // The column list is built at runtime, so PostgREST cannot infer the row
  // type from it (the same reason the read page casts its defensive select).
  // The shape is asserted here, once, instead of at each of a dozen reads.
  type ProgressRow = {
    book_id: string;
    progress_pct: number;
    last_read_at: string | null;
    last_page?: number | null;
    last_page_count?: number | null;
    books: any;
  };

  const run = (columns: string) =>
    supabase
      .from("reading_progress")
      .select(`${columns}, books ( ${bookFields} )`)
      .eq("user_id", userId)
      .gt("progress_pct", 0)
      .order("last_read_at", { ascending: false })
      .returns<ProgressRow[]>();

  const withPage = await run("book_id, progress_pct, last_read_at, last_page, last_page_count");
  if (!withPage.error) return withPage;
  if (withPage.error.code !== "42703" && withPage.error.code !== "PGRST204") return withPage;
  return run("book_id, progress_pct, last_read_at");
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
    profileResult, savedBooks, progressResult, readingLists,
    subAlerts, inProgressPaths, myRequests, downloadHistory,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role, avatar_url, created_at")
      .eq("id", user.id)
      .single<Profile>(),
    getSavedBooks(),
    readingProgressRows(supabase, user.id, BOOK_FIELDS),
    getMyReadingLists(),
    getNewContentForSubscriptions().catch(() => []),
    getInProgressPaths().catch(() => []),
    getMyBookRequests().catch(() => []),
    getMyDownloadHistory().catch(() => []),
  ]);

  const profile  = profileResult.data;
  const progress = progressResult.data ?? [];

  const avatarUrl    = resolveAvatarUrl(profile?.avatar_url, user.user_metadata);
  const displayName  =
    resolveFullName(profile?.full_name, user.user_metadata) ?? profile?.email ?? user.email ?? "Reader";
  const isAdmin      = ADMIN_PANEL_ROLES.includes(profile?.role as AppRole);
  const memberSince  = profile?.created_at
    ? new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-US", { month: "long", year: "numeric" })
        .format(new Date(profile.created_at))
    : null;

  // The same rows the shelves are built from, so the stats cannot disagree
  // with them. This used to be a separate `getReadingStats()` round trip that
  // re-read the identical `reading_progress` rows with the service client.
  const readingStats = computeReadingStats(progress as unknown as ReadingProgressRow[]);

  const inProgress = progress.filter((p) => p.progress_pct < 100);
  const completed  = progress.filter((p) => p.progress_pct >= 100);

  // `mapRowToBook` returns a whole `Book`; DashboardTabs is a client
  // component, so anything left on these objects is serialised into the
  // dashboard document once per book. `toBookCardData` keeps the 13 fields
  // a card renders. `lastPage` is dropped here and read from the continue
  // rows below, which are the only thing that uses it.
  const inProgressBooks = inProgress.slice(0, 10).flatMap((p) => {
    if (!p.books) return [];
    return [
      toBookCardData({
        ...mapRowToBook(p.books as any),
        progressPct: p.progress_pct,
        lastReadAt: p.last_read_at,
      }),
    ];
  });

  const completedBooks = completed.slice(0, 10).flatMap((p) => {
    if (!p.books) return [];
    return [toBookCardData({ ...mapRowToBook(p.books as any), progressPct: 100 })];
  });

  const savedCards = toBookCardList(savedBooks as any[]);

  // Continue card: the most-recently-opened in-progress book, then the next
  // three. `progress` is already ordered by last_read_at desc — and this is
  // the ONLY place real progress_pct/last_read_at/last_page feed the UI;
  // nothing here is fabricated. Built from the PROGRESS ROWS, not the card
  // list: `lastPage` lives on reading_progress and is not a card field.
  const continueRows: ContinueReadingBook[] = inProgress
    .filter((p) => p.books)
    .slice(0, 4)
    .map((p) => {
      const b = mapRowToBook(p.books as any);
      return {
        slug: b.slug,
        title: b.title,
        author: b.author,
        category: b.category ?? null,
        coverUrl: b.coverUrl ?? null,
        progressPct: p.progress_pct,
        lastReadAt: p.last_read_at ?? null,
        lastPage: p.last_page ?? null,
        lastPageCount: p.last_page_count ?? null,
      };
    });
  const [heroBook = null, ...otherInProgress] = continueRows;

  const recentActivity = buildRecentActivity({
    progress: progress.map((p) => ({
      last_read_at: p.last_read_at,
      books: p.books ? { slug: (p.books as any).slug, title: (p.books as any).title } : null,
    })),
    savedBooks: savedBooks.map((b) => ({ slug: b.slug, title: b.title, savedAt: b.savedAt })),
    downloadHistory: downloadHistory.map((d) => ({ slug: d.slug, title: d.title, downloadedAt: d.downloadedAt })),
  }, 5);

  // One column on a phone, in exactly this order; the desktop grid places the
  // same sequence into rows. Nothing is rendered twice for two breakpoints
  // (the old sidebar duplicated account info and downloads under `lg:hidden`),
  // and the reading/focus order is the visual order at every width.
  return (
    <div className="min-h-screen bg-bg-body">
      <DashboardHeader
        displayName={displayName}
        email={profile?.email ?? user.email ?? ""}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
        greetingBand={greetingBand(new Date().getHours())}
        memberSince={memberSince}
      />

      <div className="mx-auto max-w-[1300px] space-y-10 px-4 py-6 sm:px-8 sm:py-8 md:px-12 lg:space-y-12">
        {/* ── Pick up where you left off + where you stand ── */}
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ContinueReadingHero book={heroBook} others={otherInProgress} paths={inProgressPaths} />
          <ReadingSummary
            stats={readingStats}
            counts={{
              inProgress: inProgress.length,
              completed: completed.length,
              saved: savedBooks.length,
              lists: readingLists.length,
            }}
          />
        </div>

        <NewForYou alerts={subAlerts} />

        {/* ── Everything the reader owns ── */}
        <section id={LIBRARY_SECTION_ID} aria-labelledby="library-heading" className="scroll-mt-24">
          <SectionHeading
            id="library-heading"
            title={t("myLibrary")}
            description={t("libraryDesc")}
            action={<ExportMyLibrary />}
          />
          <DashboardTabs
            inProgressBooks={inProgressBooks}
            completedBooks={completedBooks}
            savedBooks={savedCards}
            readingLists={readingLists}
            totalInProgress={inProgress.length}
            totalCompleted={completed.length}
            downloadCount={downloadHistory.length}
            downloadsPanel={<DownloadsList history={downloadHistory} />}
          />
        </section>

        <RecommendedBooks viewAllHref="/books" />

        {/* ── Status: what the library owes you, what you did lately ── */}
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          <UserRequests requests={myRequests} locale={locale} />
          <RecentActivity items={recentActivity} />
        </div>

        <LearningIntent />
      </div>
    </div>
  );
}
