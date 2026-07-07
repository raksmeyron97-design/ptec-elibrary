export default function ThesesSummaryLoading() {
  return (
    <div className="min-h-screen bg-bg-body">
      {/* Header skeleton */}
      <div className="border-b border-divider bg-bg-surface px-4 py-6 md:px-12 md:py-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="skeleton h-4 w-56 rounded" />
          <div className="skeleton mt-4 h-9 w-72 rounded sm:w-96" />
          <div className="skeleton mt-3 h-4 w-full max-w-xl rounded" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-[68px] rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar + list skeleton */}
      <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-12 md:py-10">
        <div className="skeleton h-[150px] w-full rounded-2xl" />
        <div className="mt-5 space-y-8">
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s} className="rounded-2xl border border-divider bg-bg-surface p-5 sm:p-7">
              <div className="skeleton h-6 w-64 rounded" />
              <div className="mt-5 space-y-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="skeleton h-4 w-4/5 rounded" />
                    <div className="skeleton h-3 w-1/3 rounded" />
                    <div className="skeleton h-3 w-3/5 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
