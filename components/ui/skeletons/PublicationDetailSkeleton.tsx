/**
 * Loading state for a journal article — the SAME order and geometry as the
 * page it stands in for (app/[locale]/(public)/journals/articles/[slug]), so
 * nothing jumps when the real content streams in: the trail, "Back to issue",
 * the journal context, the article type, a two-line title, the byline and
 * affiliations, the citation metadata, the action row, then the body — the
 * abstract beside the "On this page" rail (desktop) or under "Jump to" (phone).
 *
 * Decorative throughout: the route's own loading boundary announces nothing,
 * and every block here is aria-hidden.
 */
export default function PublicationDetailSkeleton() {
  return (
    <section aria-hidden="true" className="min-h-screen bg-bg-surface px-4 pb-16 pt-5 sm:px-6 sm:pt-7 md:px-12">
      <div className="mx-auto max-w-[1200px]">
        {/* Trail */}
        <div className="skeleton mb-3 h-4 w-48 rounded sm:w-80" />

        {/* Header */}
        <div className="flex items-center justify-between py-3">
          <div className="skeleton h-4 w-28 rounded" />
          <div className="skeleton hidden h-4 w-44 rounded sm:block" />
        </div>
        <div className="mt-3 border-l-2 border-divider pl-3.5">
          <div className="skeleton h-5 w-64 max-w-full rounded" />
          <div className="skeleton mt-2 h-4 w-32 rounded" />
        </div>
        <div className="skeleton mt-6 h-3.5 w-20 rounded" />
        <div className="mt-3 max-w-[980px] space-y-3">
          <div className="skeleton h-8 w-full rounded-lg sm:h-10" />
          <div className="skeleton h-8 w-4/5 rounded-lg sm:h-10" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {[96, 120, 108].map((w, i) => (
            <div key={i} className="skeleton h-5 rounded" style={{ width: w }} />
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <div className="skeleton h-3.5 w-72 max-w-full rounded" />
          <div className="skeleton h-3.5 w-60 max-w-full rounded" />
        </div>
        <div className="mt-5 space-y-2.5 border-t border-divider pt-4">
          <div className="skeleton h-4 w-96 max-w-full rounded" />
          <div className="skeleton h-3.5 w-44 rounded" />
          <div className="skeleton h-4 w-56 rounded" />
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex gap-2">
            <div className="skeleton h-12 flex-1 rounded-xl sm:w-40 sm:flex-none" />
            <div className="skeleton h-12 flex-1 rounded-xl sm:w-40 sm:flex-none" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-9 rounded-lg sm:w-20" />
            ))}
          </div>
        </div>

        {/* Body: text column + rail */}
        <div className="mt-8 grid border-t border-divider pt-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-x-14 xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-x-20">
          <div className="hidden lg:col-start-2 lg:row-start-1 lg:block">
            <div className="skeleton mb-4 h-3.5 w-24 rounded" />
            <div className="space-y-3 border-l border-divider pl-4">
              {[72, 88, 64, 96, 80].map((w, i) => (
                <div key={i} className="skeleton h-4 rounded" style={{ width: w }} />
              ))}
            </div>
          </div>

          <div className="min-w-0 max-w-[760px] lg:col-start-1 lg:row-start-1">
            {/* Jump to (phone) */}
            <div className="mb-10 space-y-2 border-y border-divider py-3 lg:hidden">
              <div className="skeleton h-3.5 w-16 rounded" />
              <div className="flex flex-wrap gap-3">
                {[64, 88, 72, 80, 60].map((w, i) => (
                  <div key={i} className="skeleton h-4 rounded" style={{ width: w }} />
                ))}
              </div>
            </div>

            {/* Abstract */}
            <div className="max-w-[70ch]">
              <div className="flex items-end justify-between border-b border-divider pb-3">
                <div className="skeleton h-7 w-32 rounded" />
                <div className="skeleton h-10 w-44 rounded-xl" />
              </div>
              <div className="mt-5 space-y-3">
                {[100, 100, 100, 96, 100, 88, 100, 60].map((w, i) => (
                  <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
              <div className="mt-7 space-y-2 border-t border-divider pt-5">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-4 w-1/2 rounded" />
              </div>
            </div>

            {/* Next section */}
            <div className="mt-14 max-w-[70ch]">
              <div className="skeleton h-7 w-40 rounded border-b border-divider" />
              <div className="mt-5 space-y-3">
                {[100, 92, 100, 70].map((w, i) => (
                  <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
