export default function ThesisDetailLoading() {
  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <div className="mx-auto max-w-[1200px]">
        {/* Breadcrumb */}
        <div className="skeleton mb-6 h-4 w-64 rounded" />

        {/* Hero */}
        <div className="mb-7 overflow-hidden rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-7 md:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="skeleton mx-auto aspect-[3/4] w-[160px] shrink-0 rounded-2xl sm:mx-0 sm:w-[200px] md:w-[220px]" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="skeleton h-5 w-24 rounded-full" />
              <div className="skeleton h-8 w-full rounded" />
              <div className="skeleton h-8 w-3/4 rounded" />
              <div className="skeleton h-4 w-1/2 rounded" />
              <div className="flex gap-2 pt-2">
                {[90, 110].map((w, i) => (
                  <div key={i} className="skeleton h-7 rounded-lg" style={{ width: w }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-4">
                <div className="skeleton h-11 w-36 rounded-2xl" />
                <div className="skeleton h-11 w-32 rounded-2xl" />
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {[90, 80, 100, 120].map((w, i) => (
                  <div key={i} className="skeleton h-9 rounded-xl" style={{ width: w }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Body: tabs + sidebar */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-5">
            {/* Publication details card */}
            <div className="space-y-3 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
              <div className="skeleton h-4 w-40 rounded" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-8 w-8 shrink-0 rounded-lg" />
                  <div className="skeleton h-4 w-1/2 rounded" />
                </div>
              ))}
            </div>

            {/* Tabs card */}
            <div className="space-y-4 rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">
              <div className="flex gap-4 border-b border-divider pb-3">
                {[70, 90, 100].map((w, i) => (
                  <div key={i} className="skeleton h-5 rounded" style={{ width: w }} />
                ))}
              </div>
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-5/6 rounded" />
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-2/3 rounded" />
            </div>
          </div>

          <aside className="space-y-5">
            <div className="skeleton aspect-[3/4] w-full rounded-2xl" />
            <div className="skeleton h-32 w-full rounded-2xl" />
            <div className="grid grid-cols-2 gap-3">
              <div className="skeleton h-24 rounded-2xl" />
              <div className="skeleton h-24 rounded-2xl" />
            </div>
            <div className="skeleton h-48 w-full rounded-2xl" />
          </aside>
        </div>
      </div>
    </section>
  );
}
