export default function PostsLoading() {
  return (
    <section className="bg-bg-body px-4 py-10 md:px-12 min-h-screen">
      <div className="mx-auto max-w-[1200px] pt-8">

        {/* Header */}
        <div className="rounded-2xl border border-divider bg-bg-surface p-8 shadow-sm space-y-3">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="skeleton h-4 w-full max-w-xl rounded" />
          <div className="skeleton h-4 w-2/3 rounded" />
        </div>

        {/* Post cards */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
              <div className="skeleton aspect-[16/9] w-full" />
              <div className="p-5 space-y-3">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="flex gap-2 pt-2 items-center">
                  <div className="skeleton h-6 w-6 rounded-full shrink-0" />
                  <div className="skeleton h-4 w-24 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}