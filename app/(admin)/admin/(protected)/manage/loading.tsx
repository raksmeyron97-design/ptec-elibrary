import { EbookStatsSkeleton, EbookCommandBarSkeleton, EbooksTableSkeleton } from "@/components/admin/ebooks/EbookSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-8 space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-paper" />
        <div className="h-8 w-56 animate-pulse rounded bg-paper" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-paper" />
      </div>
      <div className="mb-6">
        <EbookStatsSkeleton />
      </div>
      <div className="mb-4">
        <EbookCommandBarSkeleton />
      </div>
      <EbooksTableSkeleton />
    </div>
  );
}
