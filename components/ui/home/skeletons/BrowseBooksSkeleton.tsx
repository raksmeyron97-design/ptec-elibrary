export default function BrowseBooksSkeleton() {
  return (
    <section className="border-y border-divider bg-bg-surface">
      <div className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="h-10 w-48 rounded-full bg-divider/40 animate-pulse shadow-sm" />
          <div className="hidden h-5 w-32 rounded bg-divider/40 animate-pulse sm:block" />
        </div>
        <div className="flex gap-4 sm:gap-5 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[150px] sm:w-[180px] lg:w-[200px] shrink-0">
              <div className="aspect-[3/4] w-full rounded-xl bg-divider/30 animate-pulse border border-divider shadow-sm mb-4" />
              <div className="h-3.5 w-3/4 rounded bg-divider/40 animate-pulse mb-2.5" />
              <div className="h-3 w-1/2 rounded bg-divider/40 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
