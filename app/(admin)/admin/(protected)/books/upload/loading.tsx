/** Mirrors the real upload page: header, workspace nav, mode switch, then the
 *  two-column form (files + context aside, details). A generic form skeleton
 *  put a single wide card where a two-column layout appears, so the fields
 *  jumped sideways when the data landed. */
export default function Loading() {
  return (
    <div className="w-full space-y-6">
      <div className="mb-4 space-y-2">
        <div className="h-4 w-52 animate-pulse rounded bg-paper" />
        <div className="h-8 w-48 animate-pulse rounded bg-paper" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-paper" />
      </div>

      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-32 animate-pulse rounded-lg bg-paper" />
        ))}
      </div>

      <div className="h-11 w-[260px] animate-pulse rounded-lg border border-divider bg-paper" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="h-[420px] animate-pulse rounded-2xl border border-divider bg-paper" />
          <div className="h-[260px] animate-pulse rounded-2xl border border-divider bg-paper" />
        </div>
        <div className="space-y-6">
          <div className="h-[560px] animate-pulse rounded-2xl border border-divider bg-paper" />
          <div className="h-[140px] animate-pulse rounded-2xl border border-divider bg-paper" />
        </div>
      </div>
    </div>
  );
}
