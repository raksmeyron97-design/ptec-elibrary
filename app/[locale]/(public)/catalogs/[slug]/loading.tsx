// app/catalogs/[slug]/loading.tsx
export default function CatalogBookLoading() {
  return (
    <div className="min-h-screen bg-bg-app">
      {/* Breadcrumb skeleton */}
      <div className="bg-bg-surface border-b border-divider px-4 py-3 md:px-12">
        <div className="mx-auto max-w-[1100px] flex items-center gap-2">
          <div className="h-4 w-10 rounded skeleton" />
          <span className="text-text-muted">›</span>
          <div className="h-4 w-24 rounded skeleton" />
          <span className="text-text-muted">›</span>
          <div className="h-4 w-32 rounded skeleton" />
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-12">
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          {/* ── Left column ── */}
          <div className="flex flex-col items-center gap-4">
            {/* Cover */}
            <div className="w-full max-w-[280px] aspect-[3/4] rounded-2xl skeleton shadow-lg" />

            {/* Availability badge */}
            <div className="w-full max-w-[280px] rounded-xl border border-divider bg-bg-surface p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full skeleton" />
                <div className="h-4 w-20 rounded skeleton" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-4 w-16 rounded skeleton" />
                <div className="h-4 w-20 rounded skeleton" />
              </div>
              <div className="rounded-lg bg-paper px-3 py-2">
                <div className="h-4 w-24 rounded skeleton" />
              </div>
            </div>

            {/* Contact button */}
            <div className="w-full max-w-[280px] h-10 rounded-xl skeleton" />
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">
            {/* Category + Title + Author */}
            <div className="space-y-3">
              <div className="h-6 w-20 rounded-full skeleton" />
              <div className="h-8 w-3/4 rounded-lg skeleton" />
              <div className="h-5 w-1/3 rounded skeleton" />
            </div>

            {/* Description card */}
            <div className="rounded-xl bg-bg-surface border border-divider p-5 shadow-sm space-y-3">
              <div className="h-3 w-20 rounded skeleton" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded skeleton" />
                <div className="h-4 w-full rounded skeleton" />
                <div className="h-4 w-5/6 rounded skeleton" />
                <div className="h-4 w-2/3 rounded skeleton" />
              </div>
            </div>

            {/* Details card */}
            <div className="rounded-xl bg-bg-surface border border-divider p-5 shadow-sm">
              <div className="h-3 w-24 rounded skeleton mb-4" />
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div
                      className="h-3 rounded skeleton"
                      style={{ width: `${50 + ((i * 13) % 30)}%`, animationDelay: `${i * 60}ms` }}
                    />
                    <div
                      className="h-4 rounded skeleton"
                      style={{ width: `${40 + ((i * 17) % 40)}%`, animationDelay: `${i * 60}ms` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Back link */}
            <div className="h-4 w-32 rounded skeleton" />
          </div>
        </div>
      </div>

    </div>
  );
}