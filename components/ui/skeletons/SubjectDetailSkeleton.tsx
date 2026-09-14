/**
 * Streaming fallback for /subjects/[slug].
 *
 * Sized to mirror the subject landing page geometry — breadcrumbs with chevrons,
 * topic header with eyebrow, title, intro blurb, statistics breakdown pills,
 * and 2-column resource group cards.
 */
export default function SubjectDetailSkeleton() {
  return (
    <div className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 sm:py-10 md:px-12">
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumbs */}
        <div className="mb-6 flex items-center gap-2">
          <div className="skeleton h-3.5 w-12 rounded" />
          <div className="skeleton h-3.5 w-3.5 rounded" />
          <div className="skeleton h-3.5 w-16 rounded" />
          <div className="skeleton h-3.5 w-3.5 rounded" />
          <div className="skeleton h-3.5 w-28 rounded" />
        </div>

        {/* Header */}
        <div className="mb-10">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton mt-2 h-9 w-64 max-w-full rounded-lg" />
          <div className="skeleton mt-3 h-4 w-[min(32rem,90%)] rounded" />
          <div className="mt-6 flex flex-wrap gap-2.5 border-t border-divider pt-5">
            <div className="skeleton h-9 w-28 rounded-xl" />
            <div className="skeleton h-9 w-28 rounded-xl" />
            <div className="skeleton h-9 w-28 rounded-xl" />
          </div>
        </div>

        {/* Resource Groups */}
        <div className="space-y-10">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g}>
              <div className="mb-4 flex items-baseline justify-between">
                <div className="skeleton h-6 w-36 rounded-md" />
                <div className="skeleton h-4 w-24 rounded" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col justify-between space-y-3 rounded-2xl border border-divider bg-bg-surface p-5"
                  >
                    <div className="flex justify-between">
                      <div className="skeleton h-4 w-16 rounded-md" />
                      <div className="skeleton h-4 w-4 rounded" />
                    </div>
                    <div className="skeleton h-5 w-3/4 rounded" />
                    <div className="skeleton h-3.5 w-1/2 rounded" />
                    <div className="skeleton h-3.5 w-5/6 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
