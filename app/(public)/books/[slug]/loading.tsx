// app/books/[slug]/loading.tsx
// Shown while the book detail page streams / fetches data.

export default function BookDetailLoading() {
  return (
    <section className="bg-gradient-to-b from-paper to-bg-surface px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[1200px]">

        {/* Back link */}
        <div className="mb-6 h-5 w-32 animate-pulse rounded bg-paper" />

        {/* Hero card */}
        <div className="grid gap-10 rounded-[28px] border border-divider bg-bg-surface p-6 shadow-[0_4px_14px_rgba(20,22,27,0.06)] md:p-9 lg:grid-cols-[300px_1fr]">

          {/* Cover skeleton */}
          <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-paper" />

          {/* Details skeleton */}
          <div className="space-y-4">
            {/* Badges */}
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-6 w-20 animate-pulse rounded-full bg-paper" />
              ))}
            </div>
            {/* Title */}
            <div className="h-9 w-4/5 animate-pulse rounded-lg bg-paper" />
            <div className="h-9 w-3/5 animate-pulse rounded-lg bg-paper" />
            {/* Author */}
            <div className="h-5 w-32 animate-pulse rounded bg-paper" />
            {/* Stars */}
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-5 w-5 animate-pulse rounded bg-paper" />
              ))}
            </div>
            {/* Summary lines */}
            <div className="space-y-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 animate-pulse rounded bg-paper"
                  style={{ width: i === 3 ? "60%" : "100%" }}
                />
              ))}
            </div>
            {/* Metadata grid */}
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[60px] animate-pulse rounded-[13px] bg-paper" />
              ))}
            </div>
            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <div className="h-[50px] w-40 animate-pulse rounded-[14px] bg-paper" />
              <div className="h-[50px] w-28 animate-pulse rounded-[14px] bg-paper" />
            </div>
          </div>
        </div>

        {/* Reviews section skeleton */}
        <div className="mt-12 space-y-4">
          <div className="h-7 w-36 animate-pulse rounded bg-paper" />
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-[16px] bg-paper" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-[20px] bg-paper" />
          </div>
        </div>

      </div>
    </section>
  );
}