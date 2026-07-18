import BrowseBooksSkeleton from '@/components/ui/home/skeletons/BrowseBooksSkeleton'

// Mirrors the real homepage layout so nothing jumps when it streams in:
// dark hero-ink hero (left copy + search, right book stack), gold seam,
// then the light section bands. The hero uses white-alpha pulse bars —
// the themed .skeleton gradient reads wrong on the #060B1A ink.
const pulse = 'animate-pulse rounded bg-white/10'

export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ════════ HERO ════════ */}
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

              {/* Trending chips */}
              <div className="mt-6 flex flex-wrap gap-2.5">
                <div className={`${pulse} h-4 w-20`} />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={`${pulse} h-9 rounded-full`}
                    style={{ width: `${96 + (i % 3) * 28}px` }}
                  />
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

      {/* ════════ START WITH YOUR GOAL ════════ */}
      <section className="border-b border-divider/60 bg-paper">
        <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-12 md:py-14">
          <div className="skeleton h-8 w-56 rounded-full" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-32 rounded-2xl border border-divider" />
            ))}
          </div>
        </div>
      </section>

      {/* ════════ FOR YOU SHELF ════════ */}
      <section className="border-b border-divider bg-bg-surface">
        <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-12 md:py-14">
          <div className="mb-6 flex items-center justify-between">
            <div className="skeleton h-8 w-48 rounded-full" />
            <div className="skeleton h-5 w-24 rounded" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={i >= 4 ? 'hidden lg:block' : i >= 3 ? 'hidden md:block' : ''}>
                <div className="skeleton aspect-[3/4] w-full rounded-xl border border-divider" />
                <div className="skeleton mt-3 h-4 w-[90%] rounded" />
                <div className="skeleton mt-2 h-3 w-2/3 rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ THIS WEEK band ════════ */}
      <div className="h-80 animate-pulse border-b border-divider/60 bg-bg-surface" aria-hidden />

      {/* ════════ COLLECTION PREVIEW ════════ */}
      <BrowseBooksSkeleton />
    </div>
  )
}
