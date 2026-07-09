// TEMPORARY preview route for visual verification of dashboard components — delete after use.
import ReadingStats from "@/components/ui/dashboard/ReadingStats";
import ContinueLearningPaths from "@/components/ui/dashboard/ContinueLearningPaths";
import NewForYou from "@/components/ui/dashboard/NewForYou";
import DashboardTabs from "@/components/ui/dashboard/DashboardTabs";
import ExportMyLibrary from "@/components/ui/dashboard/ExportMyLibrary";
import RecommendedBooks from "@/components/ui/dashboard/RecommendedBooks";

export const dynamic = "force-dynamic";

export default function DevDashboardPreview() {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="min-h-screen bg-bg-body pb-12">
      <NewForYou
        alerts={[
          { book_id: "1", title: "Khmer Grammar Vol. 1", slug: "khmer-grammar", cover_url: null, created_at: "2026-07-01", matched_label: "Khmer Language" },
          { book_id: "2", title: "Teaching Mathematics", slug: "teaching-math", cover_url: null, created_at: "2026-07-02", matched_label: "Mathematics" },
        ]}
      />
      <div className="mx-auto max-w-[1300px] px-4 pt-6 sm:px-8 md:px-12 flex gap-6 items-start">
        <div className="min-w-0 flex-1">
          <DashboardTabs
            inProgressBooks={[]}
            completedBooks={[]}
            savedBooks={[]}
            readingLists={[]}
            totalInProgress={0}
            totalCompleted={0}
          />
          <RecommendedBooks />
        </div>
        <aside className="hidden lg:block w-72 shrink-0 space-y-4">
          <ContinueLearningPaths
            paths={[
              { id: "p1", slug: "new-teacher-essentials", title: "New Teacher Essentials", title_km: null, cover_url: null, completedSteps: 3, totalSteps: 8 },
              { id: "p2", slug: "khmer-literacy", title: "Khmer Literacy Foundations", title_km: null, cover_url: null, completedSteps: 5, totalSteps: 5 },
            ]}
          />
          <ReadingStats
            stats={{
              booksStarted: 12, booksCompleted: 7, pagesRead: 1843, completionRate: 58,
              currentStreak: 4, topSubjects: [{ name: "Pedagogy", count: 5 }, { name: "Mathematics", count: 3 }],
              thisMonthBooks: 3, lastMonthBooks: 1,
            }}
          />
          <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
            <ExportMyLibrary />
          </div>
        </aside>
      </div>
    </div>
  );
}
