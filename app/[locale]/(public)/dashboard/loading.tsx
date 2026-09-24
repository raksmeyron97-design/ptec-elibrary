// Mirrors page.tsx's layout — identity band, Continue + Your reading, then the
// My Library tabs — so the streamed page replaces the skeleton in place
// instead of re-flowing a differently shaped one.
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-bg-body" aria-hidden="true">
      <div className="border-b border-divider bg-bg-surface">
        <div className="mx-auto flex max-w-[1300px] items-center gap-3.5 px-4 py-5 sm:gap-5 sm:px-8 sm:py-7 md:px-12">
          <div className="skeleton h-12 w-12 shrink-0 rounded-full sm:h-14 sm:w-14" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-6 w-56 max-w-full rounded-lg sm:h-7 sm:w-72" />
            <div className="skeleton h-4 w-40 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="skeleton h-10 w-10 rounded-xl sm:w-28" />
            <div className="skeleton h-10 w-10 rounded-xl sm:w-28" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1300px] space-y-10 px-4 py-6 sm:px-8 sm:py-8 md:px-12 lg:space-y-12">
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex gap-4 rounded-2xl border border-divider bg-bg-surface p-5 sm:gap-6 sm:p-6">
            <div className="skeleton aspect-[2/3] w-[92px] shrink-0 rounded-lg sm:w-[124px]" />
            <div className="flex flex-1 flex-col gap-2.5">
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton h-6 w-4/5 rounded-lg" />
              <div className="skeleton h-4 w-1/3 rounded" />
              <div className="mt-auto space-y-3 pt-4">
                <div className="skeleton h-2 w-full rounded-full" />
                <div className="skeleton h-10 w-44 rounded-xl" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-divider bg-bg-surface p-5">
            <div className="skeleton mb-4 h-5 w-32 rounded" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-[68px] rounded-xl" />
              ))}
            </div>
            <div className="mt-5 grid grid-cols-7 gap-1.5 border-t border-divider pt-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="skeleton h-7 rounded-md" />
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="skeleton mb-2 h-6 w-40 rounded-lg" />
          <div className="skeleton mb-5 h-4 w-72 max-w-full rounded" />
          <div className="mb-6 flex gap-6 border-b border-divider pb-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-5 w-20 rounded" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`overflow-hidden rounded-xl border border-divider bg-bg-surface ${i >= 2 ? "max-sm:hidden" : ""}`}>
                <div className="skeleton aspect-[3/4] w-full" />
                <div className="space-y-2 p-3">
                  <div className="skeleton h-4 w-5/6 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
