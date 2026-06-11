import BookCardSkeleton from '@/components/ui/books/BookCardSkeleton'

export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-bg-body">
      {/* Hero skeleton */}
      <div className="bg-bg-surface border-b border-divider px-4 py-12 md:px-12">
        <div className="mx-auto max-w-[1400px] space-y-4">
          <div className="skeleton h-10 w-72 rounded-2xl mx-auto" />
          <div className="skeleton h-5 w-96 rounded-full mx-auto" />
          <div className="skeleton h-12 w-full max-w-lg rounded-xl mx-auto mt-6" />
        </div>
      </div>

      {/* Book grid skeleton */}
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-12">
        <div className="mb-6 flex items-center justify-between">
          <div className="skeleton h-7 w-40 rounded-full" />
          <div className="skeleton h-5 w-20 rounded" />
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
