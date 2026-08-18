// Mirrors the real homepage layout so nothing jumps when it streams in:
// dark hero-ink hero (left copy + search + trust points + stat strip, right
// book stack), gold seam, then the light section bands. The hero uses
// white-alpha pulse bars — the themed .skeleton gradient reads wrong on the
// #060B1A ink.
//
// It covers the first three sections only. Below that the page is inside
// .cv-auto (content-visibility), so the browser is not laying it out yet and a
// skeleton there would be work spent on pixels nobody is looking at.
const pulse = 'animate-pulse rounded bg-white/10'

export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ════════ 1. HERO ════════ */}
      <section className="hero-ink relative text-white">
        <div className="relative mx-auto max-w-[1400px] px-4 py-14 sm:py-20 md:px-12 md:py-24 lg:py-28">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">

            {/* ── Left column ── */}
            <div className="min-w-0 w-full max-w-2xl">
              {/* Eyebrow pill */}
              <div className={`${pulse} h-7 w-64 max-w-full rounded-full`} />

              {/* Headline lines */}
              <div className="mt-5 space-y-3">
                <div className={`${pulse} h-10 w-full rounded-lg sm:h-12 lg:h-14`} />
                <div className={`${pulse} h-10 w-[85%] rounded-lg sm:h-12 lg:h-14`} />
                <div className={`${pulse} h-10 w-[55%] rounded-lg sm:h-12 lg:h-14`} />
              </div>

              {/* Description */}
              <div className="mt-6 max-w-lg space-y-2.5">
                <div className={`${pulse} h-4 w-full`} />
                <div className={`${pulse} h-4 w-4/5`} />
              </div>

              {/* Ask bar */}
              <div className="mt-8 max-w-xl">
                <div className={`${pulse} h-14 w-full rounded-2xl bg-white/[0.08] ring-1 ring-white/10`} />
                <div className={`${pulse} mt-3 h-3.5 w-72 max-w-full`} />
              </div>

              {/* Trust points — three inline items */}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                {[168, 152, 108].map((w) => (
                  <div key={w} className={`${pulse} h-[18px]`} style={{ width: `${w}px` }} />
                ))}
              </div>

              {/* Stat strip — three figure/label pairs above a hairline */}
              <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/12 pt-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="min-w-[84px]">
                    <div className={`${pulse} h-6 w-16`} />
                    <div className={`${pulse} mt-2 h-3 w-20`} />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right column — book stack (desktop only) ── */}
            <div className="relative hidden lg:flex lg:items-center lg:justify-center" aria-hidden>
              <div className="relative h-[420px] w-[300px]">
                <div className="absolute inset-0 -rotate-6 translate-x-6 rounded-2xl bg-white/[0.05]" />
                <div className="absolute inset-0 -rotate-3 translate-x-3 rounded-2xl bg-white/[0.07]" />
                <div className="animate-pulse absolute inset-0 rounded-2xl bg-white/10 ring-1 ring-white/10" />
              </div>
            </div>

          </div>
        </div>

        {/* Gold seam */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-400/80 to-transparent" />
      </section>

      {/* ════════ 2. START WITH YOUR GOAL — six goals + the browsing tile ═══ */}
      <section className="border-b border-divider/60 bg-paper">
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
          <div className="skeleton h-8 w-56 rounded-full" />
          <div className="mt-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton h-[92px] rounded-2xl border border-divider" />
            ))}
          </div>
        </div>
      </section>

      {/* ════════ 3. FEATURED — eight cards, 2-up on phones, 4-up desktop ═══ */}
      <section className="border-b border-divider/60 bg-bg-surface">
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
          <div className="mb-8 flex items-center justify-between">
            <div className="skeleton h-8 w-64 max-w-[60%] rounded-full" />
            <div className="skeleton hidden h-9 w-36 rounded-full sm:block" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={i >= 4 ? 'hidden lg:block' : ''}>
                {/* Same 3:4 box the real card reserves, so covers arriving
                    later cannot shift the grid. */}
                <div className="skeleton aspect-[3/4] w-full rounded-t-2xl border border-divider" />
                <div className="rounded-b-2xl border border-t-0 border-divider p-4">
                  <div className="skeleton h-4 w-[90%] rounded" />
                  <div className="skeleton mt-2 h-3 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
