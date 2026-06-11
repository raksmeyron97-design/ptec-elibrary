export default function BookDetailSkeleton() {
  return (
    <section className="bg-gradient-to-b from-paper to-bg-surface px-4 py-8 md:px-12 md:py-10 min-h-screen">
      <div className="mx-auto max-w-[1200px]">

        {/* Back link */}
        <div className="skeleton mb-6 h-5 w-28 rounded-full" />

        {/* Hero card */}
        <div className="grid gap-8 rounded-[28px] border border-divider bg-bg-surface p-6 shadow-md md:p-9 lg:grid-cols-[280px_1fr]">

          {/* Cover */}
          <div className="skeleton aspect-[3/4] w-full rounded-2xl border border-divider/30" />

          {/* Details */}
          <div className="space-y-4">
            {/* Badges */}
            <div className="flex gap-2 flex-wrap">
              {[80, 96, 64].map((w, i) => (
                <div key={i} className="skeleton h-6 rounded-full" style={{ width: w }} />
              ))}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <div className="skeleton h-8 w-4/5 rounded-lg" />
              <div className="skeleton h-8 w-3/5 rounded-lg" />
            </div>

            {/* Author */}
            <div className="skeleton h-5 w-36 rounded" />

            {/* Stars */}
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-5 w-5 rounded" />
              ))}
            </div>

            {/* Summary */}
            <div className="space-y-2 pt-1">
              {[100, 100, 95, 60].map((w, i) => (
                <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
              ))}
            </div>

            {/* Metadata grid */}
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-[62px] rounded-[13px]" />
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <div className="skeleton h-[50px] w-40 rounded-[14px]" />
              <div className="skeleton h-[50px] w-28 rounded-[14px]" />
              <div className="skeleton h-[50px] w-12 rounded-[14px]" />
            </div>
          </div>
        </div>

        {/* Reviews section */}
        <div className="mt-12 space-y-5">
          <div className="skeleton h-7 w-40 rounded" />
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 rounded-[16px] border border-divider bg-bg-surface p-4">
                  <div className="skeleton h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-32 rounded" />
                    <div className="skeleton h-3 w-full rounded" />
                    <div className="skeleton h-3 w-3/4 rounded" />
                  </div>
                </div>
              ))}
            </div>
            <div className="skeleton h-64 rounded-[20px]" />
          </div>
        </div>

      </div>
    </section>
  )
}
