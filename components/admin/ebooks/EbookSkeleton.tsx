/** Skeletons mirror the real zones of the collection workspace (/admin/books)
 *  so nothing jumps when the data lands: four KPI cards, a pill row, the
 *  command bar, then the table. */

export function EbookStatsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[122px] animate-pulse rounded-xl border border-divider bg-paper" />
        ))}
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-32 shrink-0 animate-pulse rounded-full border border-divider bg-paper" />
        ))}
      </div>
    </div>
  );
}

export function EbookCommandBarSkeleton() {
  return (
    <div className="rounded-xl border border-divider bg-bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-10 min-w-[220px] flex-1 animate-pulse rounded-lg border border-divider bg-paper sm:max-w-[480px]" />
        <div className="h-10 w-[168px] animate-pulse rounded-lg border border-divider bg-paper" />
        <div className="h-10 w-[168px] animate-pulse rounded-lg border border-divider bg-paper" />
        <div className="ml-auto h-10 w-36 animate-pulse rounded-lg bg-paper" />
      </div>
      <div className="mt-3 border-t border-divider pt-3">
        <div className="h-5 w-40 animate-pulse rounded bg-paper" />
      </div>
    </div>
  );
}

export function EbooksTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      <div className="h-10 border-b border-divider bg-paper/70" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-divider/60 px-4 py-3 last:border-b-0">
          <div className="h-4 w-4 animate-pulse rounded-sm bg-paper" />
          <div className="h-14 w-10 animate-pulse rounded-md bg-paper" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-paper" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-paper" />
          </div>
          <div className="hidden h-5 w-24 animate-pulse rounded-md bg-paper lg:block" />
          <div className="h-5 w-16 animate-pulse rounded-md bg-paper" />
          <div className="hidden h-8 w-16 animate-pulse rounded bg-paper lg:block" />
          <div className="hidden h-4 w-20 animate-pulse rounded bg-paper xl:block" />
        </div>
      ))}
    </div>
  );
}
