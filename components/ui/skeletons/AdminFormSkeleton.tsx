interface AdminFormSkeletonProps {
  sections?: number
}

export default function AdminFormSkeleton({ sections = 2 }: AdminFormSkeletonProps) {
  return (
    <div className="w-full p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="skeleton h-4 w-64 rounded" />
        </div>
        <div className="skeleton h-9 w-24 rounded-xl" />
      </div>

      {/* Form sections */}
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className="rounded-xl border border-divider bg-bg-surface p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3 pb-1 border-b border-divider">
            <div className="skeleton h-8 w-8 rounded-lg shrink-0" />
            <div className="skeleton h-5 w-36 rounded" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`space-y-1.5 ${i === 2 ? 'sm:col-span-2' : ''}`}>
                <div className="skeleton h-4 w-24 rounded" />
                <div className="skeleton h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>

          {s === 0 && (
            <div className="space-y-1.5">
              <div className="skeleton h-4 w-20 rounded" />
              <div className="skeleton h-32 w-full rounded-xl" />
            </div>
          )}
        </div>
      ))}

      {/* Submit buttons */}
      <div className="flex items-center gap-3 justify-end pt-2">
        <div className="skeleton h-10 w-24 rounded-xl" />
        <div className="skeleton h-10 w-36 rounded-xl" />
      </div>
    </div>
  )
}
