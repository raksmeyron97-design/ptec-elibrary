export default function SettingsLoading() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="mb-6 sm:mb-8 space-y-2">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-4 w-64 rounded" />
      </div>
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Profile card */}
        <div className="bg-bg-surface border border-divider rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="skeleton h-5 w-32 rounded" />
          <div className="flex items-center gap-5">
            <div className="skeleton h-16 w-16 rounded-full shrink-0" />
            <div className="skeleton h-9 w-32 rounded-xl" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="skeleton h-4 w-20 rounded" />
                <div className="skeleton h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <div className="skeleton h-10 w-28 rounded-xl" />
        </div>

        {/* Password card */}
        <div className="bg-bg-surface border border-divider rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="skeleton h-5 w-36 rounded" />
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="skeleton h-4 w-28 rounded" />
                <div className="skeleton h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <div className="skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
