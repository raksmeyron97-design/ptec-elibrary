// The shape of the News band while it streams: header, a feature card and
// three rows on the left, the contribution card on the plate on the right.
export default function LatestPostsSkeleton() {
  return (
    <section className="border-b border-divider/60 bg-paper" aria-hidden>
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-12 md:py-16 lg:py-20">
        <div className="mb-8 space-y-3">
          <div className="h-3 w-24 rounded skeleton" />
          <div className="h-8 w-72 rounded skeleton" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[8fr_4fr]">
          <div className="space-y-3">
            <div className="h-[172px] rounded-xl skeleton" />
            <div className="h-[264px] rounded-xl skeleton" />
          </div>
          <div className="h-[440px] rounded-2xl bg-plate" />
        </div>
      </div>
    </section>
  );
}
