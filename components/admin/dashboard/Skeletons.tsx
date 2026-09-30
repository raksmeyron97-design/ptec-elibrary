/** Loading skeletons sized to match the final sections (no layout shift). */

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-[var(--dash-line)] ${className}`} aria-hidden="true" />;
}

/** The zone divider (gold tick + label + hint) each Overview zone opens with. */
function ZoneHeaderSkeleton({ className }: { className: string }) {
  return <Pulse className={`h-3.5 rounded-md ${className}`} />;
}

/**
 * Mirrors the real Overview block for block (space-y-6 between blocks,
 * container-sized rows), so streaming in the data never shifts the layout. If
 * you change a gap or a row in OverviewView, change it here too — that
 * coupling is the entire point of this file.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      {/* 1 — Collection tiles. */}
      <div>
        <ZoneHeaderSkeleton className="w-72" />
        <div className="@container mt-2.5">
          <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @xl:gap-4 @6xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Pulse key={i} className="h-[96px]" />
            ))}
          </div>
        </div>
      </div>

      {/* 2 — The period's four KPI cards. */}
      <div>
        <ZoneHeaderSkeleton className="w-80" />
        <div className="@container mt-2.5">
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @xl:gap-5 @5xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Pulse key={i} className="h-[208px]" />
            ))}
          </div>
        </div>
      </div>

      {/* 3 — Trend + calendar. */}
      <div className="@container">
        <div className="grid gap-5 @5xl:grid-cols-12">
          <Pulse className="h-[440px] @5xl:col-span-8" />
          <Pulse className="h-[440px] @5xl:col-span-4" />
        </div>
      </div>

      {/* 4 — Needs attention. */}
      <Pulse className="h-[300px]" />

      {/* 5 — Recently added + reader requests. */}
      <div className="@container">
        <div className="grid gap-5 @3xl:grid-cols-2">
          <Pulse className="h-[380px]" />
          <Pulse className="h-[380px]" />
        </div>
      </div>

      {/* 6 — Shelf. */}
      <Pulse className="h-[340px]" />
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
