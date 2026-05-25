// app/books/loading.tsx
// Shown by Next.js while the /books page is streaming / fetching data.

export default function BooksLoading() {
  return (
    <section className="bg-gradient-to-b from-[#F6F6F4] to-[#FBFBFD] px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[1200px]">

        {/* Search bar skeleton */}
        <div className="mb-8 h-12 w-full animate-pulse rounded-[14px] bg-slate-200" />

        <div className="flex gap-8">
          {/* Sidebar skeleton */}
          <aside className="hidden w-[220px] shrink-0 lg:block">
            <div className="rounded-[20px] border border-slate-200 bg-white p-[22px] space-y-4">
              <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-[11px] bg-slate-100" />
              ))}
              <div className="pt-2 h-4 w-14 animate-pulse rounded bg-slate-200" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-[11px] bg-slate-100" />
                ))}
              </div>
            </div>
          </aside>

          {/* Card grid skeleton */}
          <div className="flex-1">
            <div className="mb-5 h-5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
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
    <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(20,22,27,0.04)]">
      {/* Cover */}
      <div className="aspect-[3/2] w-full animate-pulse bg-slate-200" />
      {/* Body */}
      <div className="p-4 space-y-2.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="flex gap-2 pt-1">
          <div className="h-5 w-14 animate-pulse rounded-full bg-slate-100" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}