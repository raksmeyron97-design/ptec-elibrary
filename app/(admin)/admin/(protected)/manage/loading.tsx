import { EbookStatsSkeleton, EbookFilterBarSkeleton, EbooksTableSkeleton } from "@/components/admin/ebooks/EbookSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="h-8 w-56 animate-pulse rounded bg-paper" />
      <EbookStatsSkeleton />
      <div className="h-14 animate-pulse rounded-xl bg-paper" />
      <EbookFilterBarSkeleton />
      <EbooksTableSkeleton />
    </div>
  );
}
