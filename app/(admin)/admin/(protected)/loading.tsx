export default function AdminLoading() {
  return (
    <div className="w-full p-6 space-y-6">
      {/* Page title */}
      <div className="skeleton h-8 w-48 rounded-lg" />

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-divider bg-bg-surface p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton h-9 w-9 rounded-xl" />
            </div>
            <div className="skeleton h-9 w-20 rounded-lg" />
            <div className="skeleton h-3 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-divider bg-bg-surface p-5 space-y-3 shadow-sm">
          <div className="skeleton h-6 w-36 rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-divider/40 last:border-0">
              <div className="skeleton h-9 w-7 rounded shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/3 rounded" />
              </div>
              <div className="skeleton h-6 w-16 rounded-full shrink-0" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-divider bg-bg-surface p-5 space-y-3 shadow-sm">
          <div className="skeleton h-6 w-32 rounded" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="skeleton h-2 w-2 rounded-full shrink-0" />
              <div className="skeleton h-3 rounded" style={{ width: `${60 + i * 8}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
