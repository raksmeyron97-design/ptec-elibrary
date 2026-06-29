export default function BrowseBooksSkeleton() {
  return (
    <section className="border-y border-divider/70 bg-gradient-to-b from-paper via-bg-surface to-paper overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
        <div className="mb-6 sm:mb-9 flex flex-wrap items-end justify-between gap-4">
          <div className="h-10 w-48 rounded-full skeleton shadow-sm" />
          <div className="hidden h-5 w-32 rounded skeleton sm:block" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-xl bg-bg-surface/40 border border-divider shadow-sm">
              <div className="aspect-[3/4] w-full rounded-xl skeleton border border-divider shadow-sm mb-4 bg-bg-surface/80" />
              <div className="flex flex-1 flex-col gap-2 p-3 pb-4">
                <div className="h-4 w-[90%] rounded bg-bg-surface/80 skeleton" />
                <div className="h-3 w-2/3 rounded bg-bg-surface/80 skeleton" />
                <div className="mt-4 flex justify-between">
                  <div className="h-3 w-1/3 rounded bg-bg-surface/80 skeleton" />
                  <div className="h-3 w-1/4 rounded bg-bg-surface/80 skeleton" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
