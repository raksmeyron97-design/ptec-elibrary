// components/ui/books/BookCover.tsx
//
// Legacy adapter: the e-book fallback cover previously rendered SVG <text>
// (random palette, space-based wrapping that broke Khmer titles). It now
// delegates to the shared PTEC GeneratedBookCover, keeping the old props API
// so existing call sites (BookCard, book detail, lists, PDF reader) work
// unchanged and all fallback covers share one design system.

import GeneratedBookCover from "@/components/ui/books/GeneratedBookCover";

type Variant = "card" | "thumb" | "detail" | "hero";

type BookCoverProps = {
  title: string;
  /** Category or department name — drives the deterministic theme. */
  label?: string | null;
  author?: string | null;
  variant?: Variant;
  className?: string;
};

const VARIANT_MAP = {
  card: "card",
  thumb: "thumbnail",
  detail: "detail",
  hero: "detail",
} as const;

export default function BookCover({
  title,
  label,
  author,
  variant = "card",
  className = "",
}: BookCoverProps) {
  return (
    <GeneratedBookCover
      title={title}
      author={author}
      category={label}
      variant={VARIANT_MAP[variant]}
      className={className}
    />
  );
}
