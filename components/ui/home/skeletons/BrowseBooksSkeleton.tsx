// The shape of <BrowseBooksSection> while it streams: header, the three-tab
// control, and one row of six covers (a snap row of 40%-wide covers on
// phones, matching the real shelf).
export default function BrowseBooksSkeleton() {
  return (
    <section className="border-b border-divider/60 bg-bg-surface overflow-hidden" aria-hidden>
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-12 md:py-16 lg:py-20">
        <div className="mb-8 space-y-3">
          <div className="h-3 w-20 rounded skeleton" />
          <div className="h-8 w-64 rounded skeleton" />
        </div>
        <div className="mb-6 h-11 w-full rounded-full skeleton sm:w-80" />
        <div className="flex gap-4 overflow-hidden sm:grid sm:grid-cols-4 sm:gap-5 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[40%] shrink-0 sm:w-auto">
              <div className="aspect-[2/3] w-full rounded-md skeleton" />
              <div className="mt-3 h-3 w-1/3 rounded skeleton" />
              <div className="mt-2 h-4 w-[90%] rounded skeleton" />
              <div className="mt-2 h-3 w-2/3 rounded skeleton" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
