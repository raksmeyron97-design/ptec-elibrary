// Mirrors <BookCard>'s anatomy so the swap from skeleton to card does not
// jump: a full-bleed 3:4 cover, two title lines, the author, a metrics line,
// and the CTA row — which, like the card's, phones do not draw.
export default function BookCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm" aria-hidden="true">
      {/* Cover */}
      <div className="skeleton aspect-[3/4] w-full" />

      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-2.5">
        {/* Title, two lines */}
        <div className="skeleton h-3.5 w-full rounded" />
        <div className="skeleton h-3.5 w-3/4 rounded" />
        {/* Author */}
        <div className="skeleton h-3 w-1/2 rounded" />

        <div className="mt-auto pt-2.5">
          {/* Metrics */}
          <div className="skeleton h-3 w-16 rounded" />
          {/* CTA — sm and up only, as on the card */}
          <div className="mt-2.5 hidden h-px bg-divider sm:block" />
          <div className="skeleton mt-2.5 hidden h-8 w-full rounded-lg sm:block" />
        </div>
      </div>
    </div>
  );
}
