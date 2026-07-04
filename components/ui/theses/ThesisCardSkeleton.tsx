export default function ThesisCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-bg-surface border border-divider shadow-sm">
      {/* Cover */}
      <div className="relative mx-3 mt-3 aspect-[3/4] rounded-xl sm:mx-3.5 sm:mt-3.5 skeleton border border-divider/30" />

      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-4 sm:px-4 sm:pb-4 gap-2">
        {/* Cohort badge */}
        <div className="skeleton h-3 w-16 rounded-full" />
        {/* Title */}
        <div className="skeleton h-4 w-full rounded sm:h-5" />
        <div className="skeleton h-4 w-3/4 rounded sm:h-5" />
        {/* Author */}
        <div className="skeleton h-3 w-1/2 rounded sm:h-3.5" />
        {/* Abstract */}
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-5/6 rounded" />

        <div className="mt-auto pt-4 flex items-center gap-2">
          <div className="skeleton h-7 flex-1 rounded-full" />
          <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
          <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}
