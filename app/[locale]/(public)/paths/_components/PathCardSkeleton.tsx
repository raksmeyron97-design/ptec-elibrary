/**
 * Placeholder matching PathCard's real proportions — 2:1 cover, then the
 * audience line, title, description, meta row and the CTA footer under its
 * hairline. Matching the shape is the point: a generic grey box the wrong
 * height causes exactly the layout shift the skeleton is supposed to prevent.
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
      <div className="paths-skeleton aspect-[2/1] w-full" />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="paths-skeleton h-2.5 w-24 rounded" />
        <div className="paths-skeleton mt-2.5 h-4 w-4/5 rounded" />
        <div className="paths-skeleton mt-2 h-3 w-full rounded" />
        <div className="paths-skeleton mt-1.5 h-3 w-2/3 rounded" />
        <div className="mt-3 flex gap-3">
          <div className="paths-skeleton h-3 w-16 rounded" />
          <div className="paths-skeleton h-3 w-14 rounded" />
          <div className="paths-skeleton h-3 w-12 rounded" />
        </div>
        <div className="mt-auto pt-4">
          <div className="border-t border-divider pt-3.5">
            <div className="paths-skeleton h-3.5 w-24 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
