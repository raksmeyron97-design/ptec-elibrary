// components/ui/MobileFeaturedStrip.tsx
"use client";

import Image from "next/image";
import Link from "next/link";

type StripBook = {
  slug: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  coverColor?: string;
  department?: string;
};

type Props = {
  books: StripBook[];
};

/**
 * Shown only on mobile (the desktop HeroBookStack is hidden < lg).
 * A swipeable row of covers so phone users get a visual hook in the hero.
 */
export default function MobileFeaturedStrip({ books }: Props) {
  if (books.length === 0) return null;

  return (
    <div className="mt-9 lg:hidden">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-400">Featured</span>
        <Link href="/books?sort=downloads" className="text-[12px] font-semibold text-blue-100 hover:text-white">
          See all →
        </Link>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {books.map((b) => {
          const hex = b.coverColor?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#0a1629";
          return (
            <Link
              key={b.slug}
              href={`/books/${b.slug}`}
              className="group relative w-[116px] shrink-0 snap-start overflow-hidden rounded-xl border border-white/15 shadow-lg shadow-black/30"
            >
              <div className="relative aspect-[3/4] w-full">
                {b.coverUrl ? (
                  <Image src={b.coverUrl} alt={b.title} fill sizes="116px" className="object-cover" />
                ) : (
                  <div
                    className="flex h-full w-full flex-col justify-end p-2.5"
                    style={{ background: `linear-gradient(135deg, ${hex}, ${hex}cc)` }}
                  >
                    {b.department && (
                      <span className="mb-1 text-[7px] font-bold uppercase tracking-widest text-white/50">{b.department}</span>
                    )}
                    <span className="line-clamp-3 text-[10px] font-bold leading-tight text-white">{b.title}</span>
                  </div>
                )}
                {/* gold rule on press/hover */}
                <span className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6">
                <p className="line-clamp-1 text-[10px] font-bold text-white">{b.title}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
