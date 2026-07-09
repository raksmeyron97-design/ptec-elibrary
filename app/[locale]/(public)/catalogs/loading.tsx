import BookCardSkeleton from '@/components/ui/books/BookCardSkeleton'

export default function CatalogsLoading() {
  return (
    <div className="min-h-screen bg-bg-app">
      {/* Header */}
      <div className="bg-bg-surface border-b border-divider px-4 py-6 md:px-12">
        <div className="mx-auto max-w-[1400px] space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="skeleton h-7 w-48 rounded-lg" />
              <div className="skeleton h-4 w-64 rounded-md" />
            </div>
            <div className="skeleton h-4 w-24 rounded-md" />
          </div>

          <div className="skeleton h-11 w-full rounded-xl" />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              {[70, 85, 65, 90, 75, 60].map((w, i) => (
                <div key={i} className="skeleton h-8 shrink-0 rounded-full" style={{ width: w }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="skeleton h-8 w-28 rounded-full" />
              <div className="skeleton hidden sm:block h-7 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-9 w-9 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}