export default function HeroStatsSkeleton() {
  return (
    <div className="border-b border-divider/70 bg-bg-surface/50 py-8 sm:py-10">
      <div className="mx-auto max-w-[1000px] px-4 md:px-12 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-9 sm:h-10 w-24 bg-bg-surface-hover animate-pulse rounded-md mb-2"></div>
            <div className="h-3 w-16 bg-bg-surface-hover animate-pulse rounded-md mt-1.5"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
