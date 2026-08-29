/**
 * Streaming fallback for /authors/[slug].
 *
 * Shaped like the real page — portrait, name, one meta line, a statistics
 * strip, then a list of rows under a year rule — so the layout does not jump
 * when the data lands. The generic six-card grid it replaces described a page
 * this route has never rendered.
 *
 * The optional parts of the profile (biography, research interests) are NOT
 * drawn: most authors do not have them, and a skeleton that promises a
 * paragraph the record cannot supply is a worse guess than a shorter one.
 */
export default function AuthorProfileSkeleton() {
  return (
    <div className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 sm:py-10 md:px-12">
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="skeleton h-3.5 w-12 rounded" />
          <div className="skeleton h-3.5 w-16 rounded" />
          <div className="skeleton h-3.5 w-32 rounded" />
        </div>

        {/* Hero */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
          <div className="skeleton h-24 w-24 shrink-0 rounded-2xl sm:h-32 sm:w-32" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-8 w-72 max-w-full rounded-lg" />
            <div className="skeleton h-4 w-56 max-w-full rounded" />
            <div className="flex gap-2 pt-1">
              <div className="skeleton h-9 w-32 rounded-lg" />
              <div className="skeleton h-9 w-28 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Statistics strip */}
        <div className="mt-6 flex gap-8 border-t border-divider pt-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-6 w-12 rounded" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          ))}
        </div>

        {/* Works */}
        <div className="mt-10 border-t border-divider pt-8">
          <div className="skeleton mb-6 h-6 w-52 rounded-lg" />
          <div className="skeleton mb-6 h-11 w-full max-w-xs rounded-xl" />
          <div className="skeleton mb-3 h-3.5 w-16 rounded" />
          <ul className="divide-y divide-divider border-y border-divider">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="space-y-2 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="skeleton h-4 w-16 shrink-0 rounded-full" />
                  <div className="skeleton h-4 w-2/3 rounded" />
                </div>
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="skeleton h-3 w-32 rounded" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
