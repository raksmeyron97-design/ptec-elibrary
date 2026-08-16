/** Loading skeletons sized to match the final sections (no layout shift). */

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-[var(--dash-line)] ${className}`} aria-hidden="true" />;
}

/** The zone divider (gold tick + label + hint) each Overview zone opens with. */
function ZoneHeaderSkeleton({ className }: { className: string }) {
  return <Pulse className={`h-3.5 rounded-md ${className}`} />;
}

/**
 * The four engagement measures. Mirrors ExecutivePulse's own grid — one
 * column, two from `sm`, four from `lg` — NOT a five-up row: the pulse
 * renders a full-width health card above these four, and this skeleton
 * previously claimed five equal columns, which shifted the whole KPI row
 * sideways the moment real data streamed in.
 */
export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Pulse key={i} className="h-[168px]" />
      ))}
    </div>
  );
}

/**
 * Mirrors the real Overview block for block, including its two-zone rhythm
 * (space-y-8 between zones, space-y-5 within), so streaming in the data never
 * shifts the layout. If you change a gap in OverviewView, change it here too —
 * that coupling is the entire point of this file.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading">
      {/* Zone 1 · Right now — health verdict, KPI row, attention queue. */}
      <div className="space-y-5">
        <ZoneHeaderSkeleton className="w-64" />
        <Pulse className="h-[92px]" />
        <KpiRowSkeleton />
        <Pulse className="h-[220px]" />
      </div>

      {/* Zone 2 · Trends & performance. */}
      <div className="space-y-5">
        <ZoneHeaderSkeleton className="w-72" />
        <div className="grid gap-5 xl:grid-cols-12">
          <Pulse className="h-[380px] xl:col-span-8" />
          <Pulse className="h-[380px] xl:col-span-4" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Pulse className="h-[300px]" />
          <Pulse className="h-[300px]" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Pulse className="h-[240px]" />
          <Pulse className="h-[240px]" />
        </div>
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
