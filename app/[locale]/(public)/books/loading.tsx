import BookCardSkeleton from '@/components/ui/books/BookCardSkeleton'

export default function BooksLoading() {
  return (
    <div className="min-h-screen bg-bg-body">
      {/* Header */}
      <div className="border-b border-divider bg-bg-surface px-4 py-5 md:px-12 md:py-7">
        <div className="mx-auto max-w-[1400px]">
          <div className="skeleton mb-5 h-11 w-full rounded-xl" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[64, 96, 80, 128, 64].map((w, i) => (
                <div key={i} className="skeleton h-[30px] rounded-full sm:h-[32px]" style={{ width: w }} />
              ))}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="skeleton h-[30px] w-20 rounded-full sm:h-[32px]" />
              <div className="skeleton h-[30px] w-28 rounded-full sm:h-[32px]" />
            </div>
          </div>
          <div className="skeleton mt-4 h-4 w-32 rounded" />
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12 md:py-8">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
