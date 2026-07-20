export default function PostsLoading() {
  return (
    <div className="min-h-screen bg-bg-app">
      {/* Compact header */}
      <div className="border-b border-divider bg-bg-surface">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
          <div className="skeleton mb-3 h-4 w-40 rounded" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-2.5">
              <div className="skeleton h-8 w-64 rounded-lg" />
              <div className="skeleton h-4 w-full max-w-md rounded" />
            </div>
            <div className="skeleton h-11 w-full rounded-xl lg:max-w-sm" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        {/* Featured */}
        <div className="mb-8 grid overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm md:grid-cols-[1.15fr_1fr]">
          <div className="skeleton aspect-[16/9] w-full md:aspect-auto md:min-h-[320px]" />
          <div className="space-y-3 p-6 sm:p-8">
            <div className="skeleton h-5 w-24 rounded-full" />
            <div className="skeleton h-7 w-full rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-2/3 rounded" />
          </div>
        </div>

        {/* Category chips */}
        <div className="mb-6 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-24 shrink-0 rounded-full" />
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
              <div className="skeleton aspect-[16/9] w-full" />
              <div className="space-y-3 p-5">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="flex items-center justify-between gap-2 pt-3">
                  <div className="skeleton h-4 w-24 rounded" />
                  <div className="skeleton h-4 w-16 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
