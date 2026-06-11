export default function BookCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-bg-surface border border-divider shadow-sm">
      {/* Cover */}
      <div className="relative mx-3 mt-3 aspect-[3/4] rounded-lg sm:mx-3.5 sm:mt-3.5 skeleton border border-divider/30" />

      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-4 sm:px-4 sm:pb-4 gap-2">
        {/* Category badge */}
        <div className="skeleton h-3 w-14 rounded-full" />
        {/* Title line 1 */}
        <div className="skeleton h-4 w-full rounded sm:h-5" />
        {/* Title line 2 */}
        <div className="skeleton h-4 w-3/4 rounded sm:h-5" />
        {/* Author */}
        <div className="skeleton h-3 w-1/2 rounded sm:h-3.5" />

        <div className="mt-auto pt-3 flex justify-between items-center">
          {/* Stars */}
          <div className="skeleton h-3.5 w-16 rounded" />
          {/* Tag */}
          <div className="skeleton h-6 w-14 rounded-full" />
        </div>
      </div>
    </div>
  )
}
