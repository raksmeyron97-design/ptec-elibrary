// components/ui/books/GeneratedBookCover.tsx
//
// The PTEC generated book cover — shown whenever a book has no usable cover
// image. Pure CSS/SVG (no network request, no canvas), server-renderable, and
// deterministic: the same book always gets the same design (category theme +
// seed-based motif placement).
//
// Decorative by default: the card/detail layouts around it always repeat the
// title and author as real text, so the whole cover is aria-hidden unless a
// caller passes `srLabel` (use only when the cover is the sole representation).

import {
  getCategoryAcronym,
  getCategoryCoverTheme,
  getDeterministicCoverVariant,
} from "@/lib/cover-theme";

export type GeneratedCoverVariant = "thumbnail" | "card" | "detail";

type GeneratedBookCoverProps = {
  title: string;
  author?: string | null;
  category?: string | null;
  callNumber?: string | null;
  /** Stable identity for the per-book variation (slug or id). Defaults to title. */
  seed?: string | null;
  variant?: GeneratedCoverVariant;
  /** Screen-reader label. Omit (default) to keep the cover decorative. */
  srLabel?: string;
  className?: string;
};

/** Khmer text must never get uppercase/tracking treatments meant for Latin. */
function isLatinOnly(s: string): boolean {
  return /[A-Za-z]/.test(s) && !/[ក-៿]/.test(s);
}

/** Per-variant placement of the category motif (kept out of the title zone). */
const MOTIF_POS = [
  "right-[-12%] top-[6%]",
  "left-[-12%] top-[10%]",
  "right-[-16%] top-[22%]",
  "left-[-8%] top-[24%] rotate-6",
] as const;

const PATTERN_OFFSET = ["0px 0px", "8px 4px", "4px 10px", "12px 2px"] as const;

const SIZES: Record<
  GeneratedCoverVariant,
  {
    pad: string;
    /** Top wordmark — detail only; cards keep the top strip free for badges. */
    brand: string;
    /** Small PTEC mark in the footer row (cards). */
    footerBrand: string;
    category: string;
    title: string;
    titleClamp: string;
    author: string;
    chip: string;
    motif: string;
  }
> = {
  thumbnail: {
    pad: "p-2",
    brand: "hidden",
    footerBrand: "hidden",
    category: "hidden",
    title: "text-[10px] leading-[1.4]",
    titleClamp: "line-clamp-3",
    author: "hidden",
    chip: "hidden",
    motif: "hidden",
  },
  card: {
    pad: "p-3",
    brand: "hidden",
    footerBrand: "text-[8px] tracking-[0.14em]",
    category: "text-[9px]",
    title: "text-[13.5px] leading-snug",
    titleClamp: "line-clamp-3",
    author: "text-[10.5px]",
    chip: "text-[9px]",
    motif: "h-[52%] w-[52%]",
  },
  detail: {
    pad: "p-5",
    brand: "text-[10px] tracking-[0.2em]",
    footerBrand: "hidden",
    category: "text-[11px]",
    title: "text-xl leading-snug",
    titleClamp: "line-clamp-4",
    author: "text-[13px]",
    chip: "text-[10px]",
    motif: "h-[56%] w-[56%]",
  },
};

export default function GeneratedBookCover({
  title,
  author,
  category,
  callNumber,
  seed,
  variant = "card",
  srLabel,
  className = "",
}: GeneratedBookCoverProps) {
  const theme = getCategoryCoverTheme(category);
  const acronym = getCategoryAcronym(category);
  const idx = getDeterministicCoverVariant(seed ?? title);
  const s = SIZES[variant];

  const categoryLabel = category?.trim() || null;
  const chipText = callNumber?.trim() || acronym;

  return (
    <div
      aria-hidden={srLabel ? undefined : true}
      role={srLabel ? "img" : undefined}
      aria-label={srLabel}
      className={`relative flex h-full w-full flex-col overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(150deg, ${theme.background} 0%, ${theme.backgroundSoft} 100%)`,
        color: theme.foreground,
      }}
    >
      {/* Subtle dot grid (currentColor so it inherits the foreground) */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "18px 18px",
          backgroundPosition: PATTERN_OFFSET[idx],
        }}
      />

      {/* Category motif — large, faint, never over the title block */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`pointer-events-none absolute select-none opacity-[0.09] ${s.motif} ${MOTIF_POS[idx]}`}
      >
        <path d={theme.iconPath} />
      </svg>

      {/* Gold spine — the PTEC brand signature carried over from the old covers */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: "#DDB022" }}
      />

      {/* Content */}
      <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${s.pad} pl-3.5`}>
        <p className={`font-bold uppercase opacity-90 ${s.brand}`} style={{ color: "#EDCB55" }}>
          PTEC Digital Library
        </p>

        <div className="mt-auto min-w-0">
          {categoryLabel && (
            <p
              className={`truncate font-bold opacity-95 ${s.category} ${
                isLatinOnly(categoryLabel) ? "uppercase tracking-[0.14em]" : ""
              }`}
              style={{ color: theme.accent }}
            >
              {categoryLabel}
            </p>
          )}

          <p className={`font-khmer-serif mt-1 font-bold ${s.title} ${s.titleClamp}`}>
            {title}
          </p>

          {author && (
            <p className={`mt-1.5 font-medium opacity-80 ${s.author} line-clamp-1`}>
              {author}
            </p>
          )}

          {/* Footer: gold rule + PTEC mark, category/call-number chip */}
          <div className={`mt-2.5 flex items-center justify-between gap-2 ${s.chip === "hidden" ? "hidden" : ""}`}>
            <span className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className="h-[2px] w-5 shrink-0" style={{ background: "#DDB022" }} />
              <span className={`font-bold uppercase ${s.footerBrand}`} style={{ color: "#EDCB55" }}>
                PTEC
              </span>
            </span>
            <span
              className={`truncate rounded-[4px] px-1.5 py-0.5 font-mono font-semibold ${s.chip}`}
              style={{ background: "rgba(0,0,0,0.28)", color: theme.accent }}
            >
              {chipText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
