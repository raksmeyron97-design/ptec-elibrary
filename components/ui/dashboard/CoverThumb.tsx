// components/ui/dashboard/CoverThumb.tsx
// A 36–40px book cover for the dashboard's compact rows.
//
// The generated cover's "thumbnail" variant is laid out for ~64px (catalogue
// rows, admin thumbs); at 36px its title clamps into clipped fragments like
// "Fou / of / Edi". This renders the full "card" design at SCALE× and scales
// it down, so a tiny thumbnail is a faithful miniature of the cover the
// reader sees everywhere else. A real cover image is unaffected: `sizes`
// still asks for the displayed width at 2× density.
import SmartBookCover from "@/components/ui/books/SmartBookCover";

const SCALE = 4;

export default function CoverThumb({
  width = 36, coverUrl, title, author, category, seed,
}: {
  width?: number;
  coverUrl: string | null | undefined;
  title: string;
  author?: string | null;
  category?: string | null;
  seed?: string | null;
}) {
  const height = Math.round(width * 1.5);
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-md ring-1 ring-divider"
      style={{ width, height }}
      aria-hidden="true"
    >
      <span
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: width * SCALE, height: height * SCALE, transform: `scale(${1 / SCALE})` }}
      >
        <SmartBookCover
          coverUrl={coverUrl}
          title={title}
          author={author}
          category={category}
          seed={seed}
          variant="card"
          sizes={`${width * 2}px`}
        />
      </span>
    </span>
  );
}
