/**
 * Streaming fallback for /admin/roles — the same three zones the page settles
 * into (header, role cards, permission matrix), so nothing jumps on hydrate.
 */
const CATEGORY_ROWS = [2, 6, 1, 3]; // features per category, mirroring PERMISSION_GROUPS

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] pb-4" aria-busy="true">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 h-3 w-24 animate-pulse rounded bg-paper" />
        <div className="mb-2 h-7 w-56 animate-pulse rounded bg-paper" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-paper" />
        <div className="mt-3 h-6 w-52 animate-pulse rounded-full bg-paper" />
      </div>

      {/* Role cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-divider bg-bg-surface p-4 shadow-sm">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-paper" />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="h-4 w-24 animate-pulse rounded bg-paper" />
              <div className="h-6 w-8 animate-pulse rounded bg-paper" />
            </div>
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-paper" />
            <div className="mt-4 h-1.5 w-full animate-pulse rounded-full bg-paper" />
            <div className="mt-4 h-3 w-32 animate-pulse rounded bg-paper" />
          </div>
        ))}
      </div>

      {/* Command bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="h-9 w-full max-w-md animate-pulse rounded-lg bg-paper" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-paper" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-paper" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-paper" />
      </div>

      {/* Matrix */}
      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
        <div className="flex items-center gap-4 border-b border-divider bg-paper px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-bg-surface" />
          <div className="ml-auto flex gap-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-3 w-14 animate-pulse rounded bg-bg-surface" />
            ))}
          </div>
        </div>

        {CATEGORY_ROWS.map((rows, group) => (
          <div key={group}>
            <div className="flex items-center gap-3 border-y border-divider bg-slate-50/80 px-4 py-3">
              <div className="h-3 w-28 animate-pulse rounded bg-bg-surface" />
              <div className="ml-auto h-4 w-6 animate-pulse rounded-md bg-bg-surface" />
            </div>
            {Array.from({ length: rows }).map((_, row) => (
              <div
                key={row}
                className="flex h-[52px] items-center gap-4 border-b border-divider/60 px-4"
              >
                <div className="w-[240px] shrink-0">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-paper" />
                  <div className="mt-1.5 h-2.5 w-44 animate-pulse rounded bg-paper" />
                </div>
                <div className="ml-auto flex gap-6">
                  {Array.from({ length: 5 }).map((_, cell) => (
                    <div key={cell} className="h-5 w-16 animate-pulse rounded-md bg-paper" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
