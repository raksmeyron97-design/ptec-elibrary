// app/posts/loading.tsx
export default function PostsLoading() {
  return (
    <section className="bg-bg-body px-6 py-10 md:px-12 min-h-screen">
      <div className="mx-auto max-w-[1200px] pt-16">

        {/* Header card skeleton */}
        <div className="rounded-2xl border border-divider bg-bg-surface p-8 shadow-sm space-y-3">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-divider" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-paper" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-paper" />
          <div className="h-3 w-24 animate-pulse rounded bg-paper" />
        </div>

        {/* Book card grid skeleton */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
            >
              <div className="aspect-[16/9] w-full animate-pulse bg-divider" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-divider" />
                <div className="h-3 w-full animate-pulse rounded bg-paper" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-paper" />
                <div className="flex gap-2 pt-2">
                  <div className="h-6 w-6 animate-pulse rounded-full bg-paper" />
                  <div className="h-5 w-24 animate-pulse rounded bg-paper" />
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}