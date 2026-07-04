import ThesisCardSkeleton from "@/components/ui/theses/ThesisCardSkeleton";

export default function ThesesLoading() {
  return (
    <div className="min-h-screen bg-bg-body">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-10 md:py-8">
        {/* Hero skeleton */}
        <div className="skeleton mb-6 h-[260px] w-full rounded-3xl sm:h-[220px]" />

        <div className="flex gap-6 items-start">
          {/* Sidebar skeleton */}
          <div className="hidden lg:block w-72 shrink-0 space-y-4 rounded-2xl border border-divider bg-bg-surface p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-5/6 rounded" />
                <div className="skeleton h-4 w-3/4 rounded" />
              </div>
            ))}
          </div>

          {/* Main content skeleton */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="skeleton h-[68px] w-full rounded-2xl" />
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
              {Array.from({ length: 18 }).map((_, i) => (
                <ThesisCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
