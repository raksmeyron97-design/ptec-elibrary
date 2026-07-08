/** Layout-matched loading state — mirrors the real dashboard section order to avoid layout shift. */
export default function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      {/* Hero */}
      <div className="skeleton h-[120px] w-full rounded-2xl" />

      {/* Range filter row */}
      <div className="flex items-center justify-between gap-3">
        <div className="skeleton h-5 w-40 rounded" />
        <div className="skeleton h-9 w-64 rounded-xl" />
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-9 w-9 rounded-xl" />
            </div>
            <div className="skeleton h-7 w-16 rounded-lg" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
        ))}
      </div>

      {/* Needs attention */}
      <div className="space-y-4 rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">
        <div className="skeleton h-5 w-44 rounded" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-[76px] rounded-xl" />
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="skeleton h-5 w-32 rounded" />
              <div className="skeleton h-7 w-14 rounded" />
            </div>
            <div className="skeleton h-[220px] w-full rounded-xl" />
          </div>
        ))}
      </div>

      {/* Departments + activity */}
      <div className="skeleton h-[200px] w-full rounded-2xl" />
      <div className="skeleton h-[240px] w-full rounded-2xl" />
    </div>
  );
}
