// app/research/loading.tsx
export default function ResearchLoading() {
  return (
    <section className="bg-slate-50 px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[1200px]">

        {/* Header card skeleton */}
        <div className="rounded-lg bg-white p-8 shadow-sm space-y-3">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
        </div>

        {/* Book card grid skeleton */}
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(20,22,27,0.04)]"
            >
              <div className="aspect-[3/2] w-full animate-pulse bg-slate-200" />
              <div className="p-4 space-y-2.5">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="flex gap-2 pt-1">
                  <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-5 w-14 animate-pulse rounded-full bg-slate-100" />
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}