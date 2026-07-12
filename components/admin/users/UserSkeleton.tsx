/** Loading skeleton mirroring the Users page layout (stats → toolbar → table). */
export default function UserSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded-lg bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-100" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[104px] rounded-2xl border border-divider bg-slate-100" />
        ))}
      </div>

      <div className="h-12 rounded-xl border border-divider bg-slate-100" />

      <div className="overflow-hidden rounded-2xl border border-divider bg-bg-surface">
        <div className="h-11 border-b border-divider bg-paper" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-slate-50 px-4 py-3.5">
            <div className="h-4 w-4 rounded bg-slate-200" />
            <div className="h-9 w-9 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-40 rounded bg-slate-200" />
              <div className="h-3 w-56 rounded bg-slate-100" />
            </div>
            <div className="hidden h-5 w-16 rounded-full bg-slate-100 lg:block" />
            <div className="h-5 w-20 rounded-full bg-slate-100" />
            <div className="h-5 w-24 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
