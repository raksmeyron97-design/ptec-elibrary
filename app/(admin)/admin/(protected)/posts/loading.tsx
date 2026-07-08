import { PostStatsSkeleton, PostsTableSkeleton } from "@/components/admin/posts/PostSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-paper" />
      <PostStatsSkeleton />
      <div className="h-14 animate-pulse rounded-xl bg-paper" />
      <PostsTableSkeleton />
    </div>
  );
}
