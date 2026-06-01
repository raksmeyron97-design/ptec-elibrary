import SearchBar from "@/components/ui/search/SearchBar";
import BookCardSkeleton from "@/components/ui/books/BookCardSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-body">
      {/* Header Skeleton */}
      <div className="border-b border-divider bg-bg-surface px-4 py-5 md:px-12 md:py-7">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-5 h-11 w-full rounded-xl bg-paper animate-pulse" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0 w-full">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2 min-w-0 flex-1 w-full">
              <div className="h-[30px] w-16 rounded-full bg-paper animate-pulse sm:h-[32px]" />
              <div className="h-[30px] w-24 rounded-full bg-paper animate-pulse sm:h-[32px]" />
              <div className="h-[30px] w-20 rounded-full bg-paper animate-pulse sm:h-[32px]" />
              <div className="h-[30px] w-32 rounded-full bg-paper animate-pulse sm:h-[32px]" />
              <div className="h-[30px] w-16 rounded-full bg-paper animate-pulse sm:h-[32px]" />
            </div>
            <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0 mt-2 sm:mt-0">
              <div className="h-[30px] w-20 rounded-full bg-paper animate-pulse sm:h-[32px]" />
              <div className="h-[30px] w-28 rounded-full bg-paper animate-pulse sm:h-[32px]" />
            </div>
          </div>
          <div className="mt-4 h-4 w-32 rounded bg-paper animate-pulse" />
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12 md:py-8">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}