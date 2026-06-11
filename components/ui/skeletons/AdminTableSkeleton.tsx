interface AdminTableSkeletonProps {
  rows?: number
  columns?: number[]
}

export default function AdminTableSkeleton({ rows = 8, columns = [40, 200, 120, 100, 80, 80] }: AdminTableSkeletonProps) {
  return (
    <div className="w-full">
      {/* Header bar */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="flex gap-2">
          <div className="skeleton h-9 w-24 rounded-lg" />
          <div className="skeleton h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Search/filter row */}
      <div className="mb-4 flex gap-3">
        <div className="skeleton h-10 w-full max-w-sm rounded-lg" />
        <div className="skeleton h-10 w-32 rounded-lg" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
        {/* Table header */}
        <div className="border-b border-divider bg-paper/60 px-4 py-3 flex gap-4">
          {columns.map((w, i) => (
            <div key={i} className="skeleton h-3.5 rounded" style={{ width: w, flexShrink: 0 }} />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: rows }).map((_, row) => (
          <div
            key={row}
            className="flex items-center gap-4 border-b border-divider/50 px-4 py-3.5 last:border-0"
            style={{ animationDelay: `${row * 60}ms` }}
          >
            {columns.map((w, col) => (
              <div
                key={col}
                className="skeleton rounded"
                style={{
                  width: col === 0 ? w : Math.floor(w * (0.7 + Math.random() * 0.3)),
                  height: col === 0 ? w : 14,
                  flexShrink: 0,
                  borderRadius: col === 0 ? '50%' : undefined,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-8 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
