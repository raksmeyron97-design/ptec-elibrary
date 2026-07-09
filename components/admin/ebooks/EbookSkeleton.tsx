export function EbookStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-divider bg-paper" />
      ))}
    </div>
  );
}

export function EbookFilterBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="h-11 flex-1 min-w-[240px] animate-pulse rounded-xl border border-divider bg-paper" />
      <div className="h-10 w-[172px] animate-pulse rounded-xl border border-divider bg-paper" />
      <div className="h-10 w-[172px] animate-pulse rounded-xl border border-divider bg-paper" />
      <div className="h-10 w-[172px] animate-pulse rounded-xl border border-divider bg-paper" />
    </div>
  );
}

export function EbooksTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      <div className="divide-y divide-divider">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-4 w-4 animate-pulse rounded bg-paper" />
            <div className="h-14 w-10 animate-pulse rounded bg-paper" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-paper" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-paper" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-paper" />
            <div className="hidden h-4 w-20 animate-pulse rounded bg-paper sm:block" />
            <div className="hidden h-4 w-12 animate-pulse rounded bg-paper md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
