// The record page's streaming fallback, drawn from the page's own shapes —
// the title page, the access panel, the facts grid and the reading card — in
// the same grid, so nothing jumps when the record arrives. A skeleton shaped
// like a page two redesigns ago is worse than none.
export default function ThesisDetailLoading() {
  return (
    <div aria-hidden="true" className="bg-bg-app pb-16">
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="py-5">
          <div className="skeleton h-4 w-64 rounded" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-x-8">
          {/* Title page */}
          <div className="order-1 -mx-4 space-y-3 border-b border-border bg-parchment px-4 pb-6 pt-7 sm:mx-0 sm:rounded-2xl sm:border sm:px-8 sm:pb-7 sm:pt-8 lg:col-start-1 lg:row-start-1">
            <div className="skeleton h-3 w-56 rounded" />
            <div className="h-0.5 w-12 bg-accent-line" />
            <div className="skeleton h-9 w-full max-w-[24ch] rounded" />
            <div className="skeleton h-9 w-2/3 rounded" />
            <div className="skeleton h-5 w-1/2 rounded" />
            <div className="skeleton mt-2 h-4 w-full max-w-[60ch] rounded" />
            <div className="skeleton h-4 w-40 rounded" />
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <div className="skeleton h-9 w-9 rounded-full" />
              <div className="skeleton h-4 w-64 rounded" />
            </div>
          </div>

          {/* Access panel */}
          <div className="order-2 space-y-4 rounded-2xl border border-surface-brand-line bg-surface-brand-soft p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-14 w-full rounded-xl" />
            <div className="skeleton h-11 w-full rounded-lg" />
            <div className="grid grid-cols-3 gap-1 border-t border-surface-brand-line pt-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-9 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Facts grid + reading card */}
          <div className="order-3 space-y-6 lg:col-start-1 lg:row-start-2">
            <div className="rounded-2xl border border-border bg-bg-surface px-4 py-4 sm:px-6">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="skeleton h-3 w-16 rounded" />
                    <div className="skeleton h-4 w-28 rounded" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 py-3">
              {[92, 104, 88, 110].map((w, i) => (
                <div key={i} className="skeleton h-9 rounded-full" style={{ width: w }} />
              ))}
            </div>
            <div className="space-y-3 rounded-2xl border border-border bg-bg-surface p-5 shadow-sm sm:p-7">
              <div className="skeleton h-6 w-32 rounded" />
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-5/6 rounded" />
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-2/3 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
