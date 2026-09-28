/**
 * /search's streaming fallback, shaped like the page it stands in for: the
 * centred heading, the search field, the control row and result cards in the
 * same grid as <ResultCard>.
 *
 * Since Phase 9.3 the page renders its first results on the server, so it is
 * dynamic, and a dynamic page's content always arrives after the shell's first
 * flush — this fallback now paints on every document load, not only on a
 * client-side navigation. The generic six-card grid it replaces made every
 * search open on a layout that then jumped to a different one.
 */
export default function SearchPageSkeleton() {
  return (
    <div className="min-h-[calc(100vh-4rem)]" style={{ background: "var(--ptec-bg-app)" }} aria-hidden="true">
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:pt-14">
        {/* The heading's real line boxes (26/36px tight, then a subtitle that
            wraps to two lines on a phone), so the field below starts where
            the page's will. */}
        <div className="mb-5 sm:mb-10">
          <div className="mb-1 flex h-[33px] items-center justify-center sm:mb-2 sm:h-[45px]">
            <div className="skeleton h-7 w-48 rounded-xl sm:h-9 sm:w-72" />
          </div>
          <div className="flex h-10 flex-col items-center justify-center gap-1.5 sm:h-[21px]">
            <div className="skeleton h-3.5 w-72 max-w-full rounded" />
            <div className="skeleton h-3.5 w-52 max-w-full rounded sm:hidden" />
          </div>
        </div>

        <div className="mx-auto max-w-3xl">
          <div className="mb-8 h-[52px] rounded-2xl border-[1.5px] border-divider bg-bg-surface" />
          <div className="mb-5 flex gap-2 sm:mb-6">
            <div className="skeleton h-9 w-28 rounded-xl" />
            <div className="skeleton h-9 w-36 rounded-xl" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-[14px] border border-divider bg-bg-surface p-3.5 sm:gap-x-3.5 sm:p-4"
              >
                <div className="skeleton h-[76px] w-14 shrink-0 rounded-lg sm:row-span-2 sm:h-16 sm:w-12" />
                <div className="space-y-2 py-1">
                  <div className="skeleton h-3 w-1/5 rounded" />
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
                <div className="col-span-2 flex gap-2 sm:col-span-1 sm:col-start-2">
                  <div className="skeleton h-10 w-20 rounded-xl sm:h-8 sm:w-16 sm:rounded-lg" />
                  <div className="skeleton h-10 w-20 rounded-xl sm:h-8 sm:w-16 sm:rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
