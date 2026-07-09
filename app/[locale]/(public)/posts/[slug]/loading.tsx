export default function PostDetailLoading() {
  return (
    <section className="bg-bg-body px-4 py-10 md:px-12 min-h-screen">
      <div className="mx-auto max-w-[900px] pt-6 space-y-6">

        {/* Back link */}
        <div className="skeleton h-5 w-24 rounded-full" />

        {/* Article header */}
        <div className="rounded-2xl border border-divider bg-bg-surface p-6 md:p-8 space-y-4 shadow-sm">
          <div className="skeleton h-6 w-24 rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-9 w-4/5 rounded-lg" />
            <div className="skeleton h-9 w-3/5 rounded-lg" />
          </div>
          <div className="flex items-center gap-3">
            <div className="skeleton h-8 w-8 rounded-full shrink-0" />
            <div className="skeleton h-4 w-36 rounded" />
            <div className="skeleton h-4 w-24 rounded" />
          </div>
        </div>

        {/* Cover image */}
        <div className="skeleton aspect-[16/9] w-full rounded-2xl" />

        {/* Content */}
        <div className="space-y-3">
          {[100, 95, 100, 88, 70, 100, 92, 60].map((w, i) => (
            <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
          ))}
        </div>

      </div>
    </section>
  )
}
