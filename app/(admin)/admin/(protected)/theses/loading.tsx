import { ThesisStatsSkeleton, ThesesTableSkeleton } from "@/components/admin/theses/states/ThesisSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-paper" />
      <ThesisStatsSkeleton />
      <div className="h-14 animate-pulse rounded-xl bg-paper" />
      <ThesesTableSkeleton />
    </div>
  );
}
