export default function BookCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-bg-surface border border-divider shadow-sm">
      <div className="relative mx-3 mt-3 aspect-[3/4] rounded-lg sm:mx-3.5 sm:mt-3.5 bg-paper animate-pulse border border-divider/50" />
      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-4 sm:px-4 sm:pb-4">
        <div className="mb-2 h-3 w-16 rounded bg-paper animate-pulse" />
        <div className="h-4 w-full rounded bg-paper animate-pulse sm:h-5" />
        <div className="mt-1.5 h-4 w-3/4 rounded bg-paper animate-pulse sm:h-5" />
        <div className="mt-2.5 h-3 w-1/2 rounded bg-paper animate-pulse sm:h-3.5" />
        
        <div className="mt-auto pt-4 flex justify-between items-center">
           <div className="h-3.5 w-16 rounded bg-paper animate-pulse" />
           <div className="h-6 w-14 rounded-full bg-paper animate-pulse" />
        </div>
      </div>
    </div>
  );
}
