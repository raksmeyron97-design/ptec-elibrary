import BrowseBooksSkeleton from '@/components/ui/home/skeletons/BrowseBooksSkeleton'

// Mirrors the real homepage so nothing jumps when it streams in: dark
// hero-ink hero (left copy + search, right book stack), gold seam, then the
// light bands in PAGE ORDER — trust bar, goals, collections, popular shelf,
// tabbed browse.
//
// Keep this in step with page.tsx's order and with each band's `surface`
// (components/ui/home/HomeSection.tsx). A skeleton that shows a band the page
// then renders somewhere else is a layout shift wearing a loading state.
//
// The hero uses white-alpha pulse bars — the themed .skeleton gradient reads
// wrong on the #060B1A ink.
const pulse = 'animate-pulse rounded bg-white/10'

/** One band's header: eyebrow rule + title, matching <SectionHeader>. */
function HeaderSkeleton() {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <div className="skeleton h-[3px] w-7 rounded-full" />
        <div className="skeleton h-3 w-28 rounded" />
      </div>
      <div className="skeleton h-8 w-64 max-w-full rounded" />
    </div>
  )
}

/** The shared band shell — same max-width, padding and divider as HomeSection. */
function BandSkeleton({
  surface,
  children,
}: {
  surface: 'paper' | 'surface'
  children: React.ReactNode
}) {
  return (
    <section className={`border-b border-divider/60 ${surface === 'paper' ? 'bg-paper' : 'bg-bg-surface'}`}>
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">{children}</div>
    </section>
  )
}

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

      {/* ════════ TRUST BAR — three figures, own thin shell ════════ */}
      <section className="border-b border-divider/60 bg-paper">
        <div className="mx-auto max-w-[1400px] px-4 py-7 sm:py-8 md:px-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton h-12 w-12 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="skeleton h-7 w-24 rounded" />
                  <div className="skeleton mt-2 h-3.5 w-32 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ START WITH YOUR GOAL — 2-up on phones, 3-up from lg ════════ */}
      <BandSkeleton surface="surface">
        <HeaderSkeleton />
        <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-[104px] rounded-2xl border border-divider sm:h-[92px]" />
          ))}
        </div>
      </BandSkeleton>

      {/* ════════ BROWSE BY COLLECTION — 2-up on phones, 4-up from lg ════════ */}
      <BandSkeleton surface="paper">
        <HeaderSkeleton />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-[148px] rounded-xl border border-divider sm:h-[168px]" />
          ))}
        </div>
        <div className="skeleton mt-3 h-[76px] rounded-xl border border-divider sm:mt-4" />
      </BandSkeleton>

      {/* ════════ POPULAR SHELF ════════ */}
      <BandSkeleton surface="surface">
        <HeaderSkeleton />
        <div className="flex gap-4 overflow-hidden sm:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[150px] shrink-0 sm:w-[180px] lg:w-[200px]">
              <div className="skeleton aspect-[3/4] w-full rounded-xl border border-divider" />
              <div className="skeleton mt-3 h-4 w-[90%] rounded" />
              <div className="skeleton mt-2 h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      </BandSkeleton>

      {/* ════════ COLLECTION PREVIEW ════════ */}
      <BrowseBooksSkeleton />
    </div>
  )
}
