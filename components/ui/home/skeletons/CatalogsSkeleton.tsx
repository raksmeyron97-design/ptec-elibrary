export default function CatalogsSkeleton() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
      <div className="mb-9 flex items-end justify-between gap-5">
        <div className="h-8 w-48 rounded bg-bg-surface/60 animate-pulse" />
        <div className="hidden h-5 w-32 rounded bg-bg-surface/60 animate-pulse sm:block" />
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-xl bg-bg-surface/40 border border-divider shadow-sm">
            <div className="aspect-[3/4] w-full bg-bg-surface/80 animate-pulse" />
            <div className="flex flex-1 flex-col gap-2 p-3 pb-4">
              <div className="h-4 w-[90%] rounded bg-bg-surface/80 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-bg-surface/80 animate-pulse" />
              <div className="mt-4 flex justify-between">
                <div className="h-3 w-1/3 rounded bg-bg-surface/80 animate-pulse" />
                <div className="h-3 w-1/4 rounded bg-bg-surface/80 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
