// app/catalogs/loading.tsx
export default function CatalogsLoading() {
  return (
    <div className="min-h-screen bg-bg-app">
      {/* ── Header skeleton ── */}
      <div className="bg-bg-surface border-b border-divider px-4 py-6 md:px-12">
        <div className="mx-auto max-w-[1400px] space-y-4">
          {/* Title row */}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="h-7 w-48 rounded-lg bg-paper animate-pulse" />
              <div className="h-4 w-64 rounded-md bg-paper animate-pulse" />
            </div>
            <div className="h-4 w-24 rounded-md bg-paper animate-pulse" />
          </div>

          {/* Search bar */}
          <div className="h-11 w-full rounded-xl bg-paper animate-pulse" />

          {/* Filter pills */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 shrink-0 rounded-full bg-paper animate-pulse"
                  style={{ width: `${60 + Math.random() * 40}px`, animationDelay: `${i * 75}ms` }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-28 rounded-full bg-paper animate-pulse" />
              <div className="hidden sm:block h-7 w-16 rounded-full bg-paper animate-pulse" />
              <div className="hidden sm:block h-7 w-12 rounded-full bg-paper animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid skeleton ── */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Cover */}
              <div className="aspect-[3/4] bg-paper animate-pulse" />
              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-paper animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-paper animate-pulse" />
                <div className="flex items-center gap-1.5 pt-1">
                  <div className="h-2 w-2 rounded-full bg-paper animate-pulse" />
                  <div className="h-3 w-16 rounded bg-paper animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination skeleton */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-9 rounded-lg bg-paper animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}