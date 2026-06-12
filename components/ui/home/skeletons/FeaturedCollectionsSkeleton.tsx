import { SectionTitle } from "@/components/ui/core/SectionTitle";

export default function FeaturedCollectionsSkeleton() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 sm:py-14 md:px-12 md:py-20">
      <div className="mb-6 sm:mb-9 flex items-end justify-between gap-5">
        <div className="h-8 w-48 bg-bg-surface-hover animate-pulse rounded-md"></div>
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-lg border border-divider bg-bg-surface-hover animate-pulse p-6">
            <div className="mb-4 h-12 w-12 rounded-xl bg-divider/30"></div>
            <div className="h-5 w-24 rounded bg-divider/30"></div>
          </div>
        ))}
      </div>
    </section>
  );
}
