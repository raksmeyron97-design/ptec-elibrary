export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-bg-body px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[900px] space-y-6">

        {/* Profile header */}
        <div className="flex items-center gap-4 rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">
          <div className="skeleton h-16 w-16 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-6 w-40 rounded-lg" />
            <div className="skeleton h-4 w-56 rounded" />
          </div>
          <div className="skeleton h-9 w-24 rounded-xl" />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-divider bg-bg-surface p-4 space-y-2 shadow-sm">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-8 w-12 rounded-lg" />
            </div>
          ))}
        </div>

        {/* Reading history */}
        <div className="rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm space-y-4">
          <div className="skeleton h-6 w-40 rounded" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-12 w-9 rounded shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
