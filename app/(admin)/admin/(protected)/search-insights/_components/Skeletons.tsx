/**
 * Layout-stable placeholders. Each mirrors the height of the block it stands
 * in for, so nothing below jumps when the real content streams in — and each
 * carries role="status" so a screen reader is told the region is loading
 * rather than being handed an empty landmark.
 */
function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-paper ${className}`} />;
}

export function KpiSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" role="status" aria-busy="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
          <Block className="h-3 w-24" />
          <Block className="mt-4 h-7 w-20" />
          <Block className="mt-3 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm" role="status" aria-busy="true">
      <Block className="h-4 w-40" />
      <Block className="mt-4 h-[300px] w-full" />
    </div>
  );
}

export function PanelSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm" role="status" aria-busy="true">
      <Block className="h-4 w-40" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }, (_, index) => (
          <Block key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-divider bg-bg-surface shadow-sm" role="status" aria-busy="true">
      <div className="border-b border-divider p-5">
        <Block className="h-4 w-48" />
        <Block className="mt-2 h-3 w-72" />
      </div>
      <div className="space-y-2 p-5">
        {Array.from({ length: rows }, (_, index) => (
          <Block key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
