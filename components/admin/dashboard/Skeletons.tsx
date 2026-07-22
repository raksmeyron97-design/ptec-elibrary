/** Loading skeletons sized to match the final sections (no layout shift). */

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/60 ${className}`} aria-hidden="true" />;
}

export function KpiRowSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Pulse key={i} className="h-[168px]" />
      ))}
    </div>
  );
}

/**
 * Mirrors the real Overview grid block for block (pulse → attention → chart +
 * pathways → two two-column rows → footer) so streaming in the data never
 * shifts the layout.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <KpiRowSkeleton />
      <Pulse className="h-[220px]" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Pulse className="h-[380px] lg:col-span-8" />
        <Pulse className="h-[380px] lg:col-span-4" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pulse className="h-[300px]" />
        <Pulse className="h-[300px]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pulse className="h-[240px]" />
        <Pulse className="h-[240px]" />
      </div>
      <Pulse className="h-[28px]" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Pulse className="h-[48px]" />
      <Pulse className="h-[420px]" />
      <Pulse className="h-[220px]" />
    </div>
  );
}

export function CardsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-[110px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pulse className="h-[300px]" />
        <Pulse className="h-[300px]" />
      </div>
    </div>
  );
}
