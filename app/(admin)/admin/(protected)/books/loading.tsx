import { EbookStatsSkeleton, EbookCommandBarSkeleton, EbooksTableSkeleton } from "@/components/admin/ebooks/EbookSkeleton";

/** Zone-for-zone with books/page.tsx — header, workspace nav, KPIs, command
 *  bar, table — so nothing shifts when the data lands. The nav strip block is
 *  not decoration: without it every zone below it jumped up by 36px. */
export default function Loading() {
  return (
    <div className="w-full space-y-6">
      <div className="mb-4 space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-paper" />
        <div className="h-8 w-56 animate-pulse rounded bg-paper" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-paper" />
      </div>

      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-32 animate-pulse rounded-lg bg-paper" />
        ))}
      </div>

      <EbookStatsSkeleton />
      <EbookCommandBarSkeleton />
      <EbooksTableSkeleton />
    </div>
  );
}
