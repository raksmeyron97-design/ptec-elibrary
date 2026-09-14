// Streaming fallback for /subjects.
//
// Mirrors the hub's real shape — breadcrumb, header block, then a 1/2/3-column
// tile grid — rather than re-exporting GenericPageSkeleton, so the layout does
// not reflow when the taxonomy arrives.
export default function SubjectsHubLoading() {
  return (
    <main className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 sm:py-10 md:px-12">
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="skeleton h-3.5 w-12 rounded" />
          <div className="skeleton h-3.5 w-3.5 rounded" />
          <div className="skeleton h-3.5 w-20 rounded" />
        </div>

        {/* CollectionHeader */}
        <div className="mb-8 sm:mb-10">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton mt-2 h-9 w-64 max-w-full rounded-lg" />
          <div className="skeleton mt-3 h-4 w-[min(34rem,95%)] rounded" />
          <div className="mt-4 flex gap-2">
            <div className="skeleton h-7 w-28 rounded-full" />
            <div className="skeleton h-7 w-28 rounded-full" />
          </div>
        </div>

        {/* Search input skeleton */}
        <div className="skeleton mb-8 h-12 w-full rounded-xl" />

        {/* Tiles Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex flex-col justify-between rounded-2xl border border-divider bg-bg-surface p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-24 rounded" />
                    <div className="skeleton h-5 w-3/4 rounded" />
                  </div>
                  <div className="skeleton h-4 w-4 shrink-0 rounded" />
                </div>
                <div className="mt-3 flex gap-1.5">
                  <div className="skeleton h-5 w-20 rounded-md" />
                  <div className="skeleton h-5 w-16 rounded-md" />
                </div>
              </div>
              <div className="mt-4 border-t border-divider/60 pt-3">
                <div className="skeleton h-3 w-40 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
