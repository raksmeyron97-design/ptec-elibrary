/**
 * Streaming fallback for /admin/roles — the same three zones the page settles
 * into (header, role rail, permission pane), so nothing jumps on hydrate.
 */
const CATEGORY_ROWS = [2, 7, 1, 3]; // features per category, mirroring PERMISSION_GROUPS

export default function Loading() {
  return (
    <div className="w-full pb-2" aria-busy="true">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 h-3 w-24 animate-pulse rounded bg-paper" />
        <div className="mb-2 h-7 w-56 animate-pulse rounded bg-paper" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-paper" />
        <div className="mt-2.5 h-6 w-52 animate-pulse rounded-full bg-paper" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* Role rail */}
        <div className="-mx-1 flex gap-2 overflow-hidden px-1 lg:mx-0 lg:flex-col lg:px-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-56 shrink-0 rounded-xl border border-divider bg-bg-surface p-3 lg:w-full"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-paper" />
                <div className="flex-1">
                  <div className="h-3.5 w-20 animate-pulse rounded bg-paper" />
                  <div className="mt-1.5 h-3 w-14 animate-pulse rounded bg-paper" />
                </div>
              </div>
              <div className="mt-2.5 h-1 w-full animate-pulse rounded-full bg-paper" />
            </div>
          ))}
        </div>

        {/* Permission pane */}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2.5">
            <div className="h-9 w-full max-w-sm flex-1 animate-pulse rounded-lg bg-paper" />
            <div className="h-9 w-36 animate-pulse rounded-lg bg-paper" />
            <div className="h-9 w-28 animate-pulse rounded-lg bg-paper" />
          </div>

          <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
            <div className="border-b border-divider px-5 py-4">
              <div className="h-5 w-44 animate-pulse rounded bg-paper" />
              <div className="mt-2 h-3 w-64 animate-pulse rounded bg-paper" />
            </div>
            {CATEGORY_ROWS.map((rows, groupIndex) => (
              <div key={groupIndex}>
                <div className="flex items-center gap-3 bg-paper/70 px-5 py-2.5">
                  <div className="h-3 w-28 animate-pulse rounded bg-paper" />
                </div>
                {Array.from({ length: rows }).map((_, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="flex items-center justify-between gap-4 border-t border-divider/60 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="h-3.5 w-40 animate-pulse rounded bg-paper" />
                      <div className="mt-1.5 h-3 w-64 max-w-full animate-pulse rounded bg-paper" />
                    </div>
                    <div className="h-6 w-20 shrink-0 animate-pulse rounded-md bg-paper" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
