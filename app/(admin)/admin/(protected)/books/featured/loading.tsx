/** Zone-for-zone with featured/page.tsx — header, workspace nav, placement
 *  note, then the shelf rows — so nothing shifts when the data lands. The nav
 *  strip block is load-bearing for the same reason it is in books/loading.tsx:
 *  without it every zone below jumps up by 36px. */
export default function Loading() {
  return (
    <div className="w-full space-y-6">
      <div className="mb-4 space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-paper" />
        <div className="h-8 w-56 animate-pulse rounded bg-paper" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-paper" />
      </div>

      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-32 animate-pulse rounded-lg bg-paper" />
        ))}
      </div>

      <div className="h-11 w-full animate-pulse rounded-xl bg-paper" />

      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[92px] w-full animate-pulse rounded-xl bg-paper" />
        ))}
      </div>
    </div>
  );
}
