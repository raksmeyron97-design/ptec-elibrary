// Streaming fallback for /authors.
//
// Mirrors the hub's real shape — breadcrumb, header block, then a 1/2/3-column
// tile grid — rather than re-exporting GenericPageSkeleton, so the layout does
// not reflow when the taxonomy arrives.
export default function AuthorsHubLoading() {
  return (
    <main className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 sm:py-10 md:px-12">
      <div className="mx-auto max-w-5xl">
        <div className="skeleton mb-5 h-4 w-36 rounded" />
        <div className="mb-8">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton mt-2.5 h-8 w-[min(26rem,85%)] rounded-lg" />
          <div className="skeleton mt-3 h-4 w-[min(34rem,95%)] rounded" />
          <div className="mt-4 flex gap-2">
            <div className="skeleton h-6 w-28 rounded-md" />
            <div className="skeleton h-6 w-24 rounded-md" />
          </div>
        </div>

        {/* Search & alphabet skeleton */}
        <div className="mb-6 space-y-3">
          <div className="skeleton h-12 w-full rounded-xl" />
          <div className="flex gap-1 overflow-hidden py-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton h-8.5 w-8.5 shrink-0 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Cards grid skeleton */}
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-divider bg-bg-surface p-4">
              <div className="skeleton h-3 w-16 rounded" />
              <div className="skeleton mt-2 h-4 w-3/4 rounded" />
              <div className="skeleton mt-2 h-3 w-1/2 rounded" />
              <div className="mt-4 border-t border-divider/60 pt-2.5">
                <div className="skeleton h-3 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
