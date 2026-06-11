export default function GenericPageSkeleton() {
  return (
    <div className="min-h-screen bg-bg-body px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[1200px] space-y-6">

        {/* Page title */}
        <div className="space-y-2">
          <div className="skeleton h-9 w-56 rounded-xl" />
          <div className="skeleton h-4 w-80 rounded" />
        </div>

        {/* Content blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-divider bg-bg-surface p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-5/6 rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
