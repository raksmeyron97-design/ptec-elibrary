export default function LatestPostsSkeleton() {
  return (
    <section className="bg-bg-surface py-20">
      <div className="mx-auto max-w-[1400px] px-4 md:px-12">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-3 h-3 w-24 rounded bg-brand/10 animate-pulse" />
          <div className="mb-4 h-8 w-64 rounded bg-divider/40 animate-pulse sm:w-96" />
          <div className="h-4 w-full max-w-xl rounded bg-divider/30 animate-pulse" />
        </div>

        {/* Featured + list */}
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:gap-8">
          {/* Featured Card */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-divider/60 bg-paper shadow-sm">
            <div className="aspect-[16/10] w-full bg-divider/30 animate-pulse" />
            <div className="flex flex-1 flex-col p-6 sm:p-7">
              <div className="mb-4 h-4 w-32 rounded bg-divider/40 animate-pulse" />
              <div className="mb-3 mt-3 h-6 w-3/4 rounded bg-divider/40 animate-pulse" />
              <div className="mb-6 h-4 w-full rounded bg-divider/40 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-divider/40 animate-pulse" />
              
              <div className="mt-auto border-t border-divider/50 pt-4 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-brand/10 animate-pulse" />
                  <div className="h-4 w-24 rounded bg-divider/40 animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          {/* List Cards */}
          <div className="flex flex-col gap-4 sm:gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4 rounded-xl border border-divider/60 bg-paper p-3 shadow-sm">
                <div className="h-[88px] w-[88px] shrink-0 rounded-lg bg-divider/30 animate-pulse sm:h-24 sm:w-24" />
                <div className="flex flex-1 flex-col py-0.5 justify-center">
                  <div className="mb-2 h-3 w-16 rounded bg-divider/40 animate-pulse" />
                  <div className="mb-2 h-4 w-[90%] rounded bg-divider/40 animate-pulse" />
                  <div className="h-4 w-2/3 rounded bg-divider/40 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* View all */}
        <div className="mt-12 flex justify-center">
          <div className="h-10 w-36 rounded-full bg-divider/40 animate-pulse shadow-sm" />
        </div>
      </div>
    </section>
  );
}
