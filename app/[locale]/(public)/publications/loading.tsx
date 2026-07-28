// Streaming fallback for /publications.
//
// Mirrors the real route rather than re-exporting GenericPageSkeleton: this
// page opens on an ink hero, then a filter row, then a 2/3/4/4/5-column card
// grid, so the generic three-column list it used to show relaid out completely
// when the content arrived. The column counts here are copied from page.tsx —
// keep them in step, that is the whole point of this file.
export default function PublicationsLoading() {
  return (
    <div className="min-h-screen bg-bg-body">
      {/* Hero band */}
      <div className="hero-ink">
        <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-12 md:py-14">
          <div className="h-6 w-40 animate-pulse rounded-full bg-white/10" />
          <div className="mt-4 h-9 w-[min(28rem,90%)] animate-pulse rounded-lg bg-white/10 sm:h-11" />
          <div className="mt-3 h-4 w-[min(36rem,95%)] animate-pulse rounded bg-white/10" />
          <div className="mt-6 h-12 w-full max-w-2xl animate-pulse rounded-2xl bg-white/[0.08] ring-1 ring-white/10" />
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12 md:py-8">
        {/* Filter row: search + four selects */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="skeleton h-10 flex-1 rounded-xl sm:min-w-[16rem]" />
          {[104, 128, 96, 112].map((w, i) => (
            <div key={i} className="skeleton h-10 rounded-xl" style={{ width: w }} />
          ))}
        </div>

        {/* Result count */}
        <div className="skeleton mt-4 h-4 w-40 rounded" />

        {/* Card grid */}
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-divider bg-bg-surface p-3">
              <div className="skeleton aspect-[3/4] w-full rounded-xl" />
              <div className="skeleton mt-3 h-4 w-[92%] rounded" />
              <div className="skeleton mt-2 h-4 w-3/5 rounded" />
              <div className="skeleton mt-3 h-3 w-2/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
