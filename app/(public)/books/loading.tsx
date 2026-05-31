// app/(public)/books/loading.tsx
// Shown by Next.js while the /books page is streaming / fetching data.

export default function BooksLoading() {
  return (
    <section className="bg-bg-body px-6 py-10 md:px-12 min-h-screen">
      <div className="mx-auto max-w-[1400px]">

        {/* Search bar skeleton */}
        <div className="mb-8 h-12 w-full max-w-2xl mx-auto animate-pulse rounded-full bg-paper" />

        <div className="flex gap-8">
          {/* Card grid skeleton */}
          <div className="flex-1">
            <div className="mb-5 h-5 w-32 animate-pulse rounded bg-paper" />
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <BookCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BookCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      {/* Cover */}
      <div className="relative mx-3 mt-3 overflow-hidden rounded-xl sm:mx-3.5 sm:mt-3.5 border border-divider/50">
        <div className="aspect-[3/4] w-full animate-pulse bg-paper" />
      </div>
      {/* Body */}
      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-4 sm:px-4 sm:pb-4 space-y-2.5">
        <div className="h-3 w-16 animate-pulse rounded-full bg-paper" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-paper" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-paper" />
        <div className="mt-auto flex justify-between pt-3">
          <div className="h-3 w-10 animate-pulse rounded bg-paper" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-paper" />
        </div>
      </div>
    </div>
  );
}