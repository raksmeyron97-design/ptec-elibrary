// app/catalogs/[slug]/loading.tsx
export default function CatalogBookLoading() {
  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      {/* Breadcrumb skeleton */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 md:px-12">
        <div className="mx-auto max-w-[1100px] flex items-center gap-2">
          <div className="h-4 w-10 rounded bg-slate-100 animate-pulse" />
          <span className="text-slate-200">›</span>
          <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
          <span className="text-slate-200">›</span>
          <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-12">
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          {/* ── Left column ── */}
          <div className="flex flex-col items-center gap-4">
            {/* Cover */}
            <div className="w-full max-w-[280px] aspect-[3/4] rounded-2xl bg-slate-200 animate-pulse shadow-lg" />

            {/* Availability badge */}
            <div className="w-full max-w-[280px] rounded-xl border border-slate-100 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-slate-200 animate-pulse" />
                <div className="h-4 w-20 rounded bg-slate-200 animate-pulse" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-4 w-16 rounded bg-slate-100 animate-pulse" />
                <div className="h-4 w-20 rounded bg-slate-200 animate-pulse" />
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
              </div>
            </div>

            {/* Contact button */}
            <div className="w-full max-w-[280px] h-10 rounded-xl bg-slate-200 animate-pulse" />
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">
            {/* Category + Title + Author */}
            <div className="space-y-3">
              <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse" />
              <div className="h-8 w-3/4 rounded-lg bg-slate-200 animate-pulse" />
              <div className="h-5 w-1/3 rounded bg-slate-100 animate-pulse" />
            </div>

            {/* Description card */}
            <div className="rounded-xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
              <div className="h-3 w-20 rounded bg-slate-200 animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
                <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
                <div className="h-4 w-5/6 rounded bg-slate-100 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-slate-100 animate-pulse" />
              </div>
            </div>

            {/* Details card */}
            <div className="rounded-xl bg-white border border-slate-100 p-5 shadow-sm">
              <div className="h-3 w-24 rounded bg-slate-200 animate-pulse mb-4" />
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div
                      className="h-3 rounded bg-slate-100 animate-pulse"
                      style={{ width: `${50 + Math.random() * 30}%`, animationDelay: `${i * 60}ms` }}
                    />
                    <div
                      className="h-4 rounded bg-slate-200 animate-pulse"
                      style={{ width: `${40 + Math.random() * 40}%`, animationDelay: `${i * 60}ms` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Back link */}
            <div className="h-4 w-32 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Spinner overlay for interactive actions */}
      <div className="fixed bottom-6 right-6 hidden" id="action-spinner">
        <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg border border-slate-100">
          <svg className="h-4 w-4 animate-spin text-[#007c91]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium text-slate-600">Loading…</span>
        </div>
      </div>
    </div>
  );
}