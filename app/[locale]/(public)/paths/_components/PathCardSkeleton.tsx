/**
 * Placeholder matching PathCard's real proportions — 16:6 cover, then title,
 * description, tag row and meta. Matching the shape is the point: a generic
 * grey box the wrong height causes exactly the layout shift the skeleton is
 * supposed to prevent.
 *
 * `.paths-skeleton` sweeps a gradient and is disabled under
 * prefers-reduced-motion (globals.css).
 */
export default function PathCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="paths-skeleton aspect-[16/6] w-full" />
      <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
        <div className="paths-skeleton h-4 w-4/5 rounded" />
        <div className="paths-skeleton h-3 w-full rounded" />
        <div className="paths-skeleton h-3 w-2/3 rounded" />
        <div className="mt-1 flex gap-1.5">
          <div className="paths-skeleton h-4 w-14 rounded-md" />
          <div className="paths-skeleton h-4 w-12 rounded-md" />
        </div>
        <div className="mt-auto flex gap-3 pt-2">
          <div className="paths-skeleton h-3 w-16 rounded" />
          <div className="paths-skeleton h-3 w-16 rounded" />
        </div>
      </div>
    </div>
  );
}
