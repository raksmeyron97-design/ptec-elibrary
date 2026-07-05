export default function PublicationDetailSkeleton() {
  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <div className="mx-auto max-w-[1200px]">
        {/* Breadcrumb */}
        <div className="skeleton mb-6 h-5 w-56 rounded-full" />

        {/* Hero */}
        <div className="mb-7 rounded-[28px] border border-divider bg-bg-surface p-5 shadow-sm sm:p-7 md:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <div className="skeleton h-6 w-28 rounded-full" />
            <div className="skeleton h-6 w-24 rounded-full" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="skeleton h-8 w-full rounded-lg" />
            <div className="skeleton h-8 w-3/4 rounded-lg" />
          </div>
          <div className="skeleton mt-4 h-5 w-2/5 rounded" />
          <div className="mt-5 flex flex-wrap gap-2">
            {[100, 90, 80].map((w, i) => (
              <div key={i} className="skeleton h-7 rounded-lg" style={{ width: w }} />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <div className="skeleton h-11 w-40 rounded-[14px]" />
            <div className="skeleton h-11 w-40 rounded-[14px]" />
          </div>
        </div>

        {/* Sticky nav */}
        <div className="mb-7 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-20 shrink-0 rounded-lg" />
          ))}
        </div>

        {/* Body */}
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-10">
            {/* Overview card */}
            <div className="skeleton h-64 rounded-2xl" />
            {/* Abstract */}
            <div className="max-w-[70ch] space-y-2">
              <div className="skeleton h-4 w-24 rounded" />
              {[100, 100, 100, 80].map((w, i) => (
                <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
              ))}
            </div>
            {/* Full text */}
            <div className="skeleton h-48 rounded-2xl" />
            {/* References */}
            <div className="space-y-2">
              <div className="skeleton h-4 w-28 rounded" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded-xl" />
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="skeleton mx-auto aspect-[3/4] w-full max-w-[260px] rounded-2xl" />
            <div className="skeleton h-32 rounded-2xl" />
            <div className="skeleton h-24 rounded-2xl" />
            <div className="skeleton h-52 rounded-2xl" />
            <div className="skeleton h-56 rounded-2xl" />
          </div>
        </div>

        {/* Related grid */}
        <div className="mt-16 space-y-5">
          <div className="skeleton h-7 w-52 rounded" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[3/4.6] rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
