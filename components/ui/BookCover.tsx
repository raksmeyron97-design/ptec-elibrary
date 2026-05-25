// components/ui/BookCover.tsx
// A purely-generated, designed book cover used whenever a book has no real
// cover image. Deterministic theme + decoration based on the title, so the
// same book always looks the same. Server-renderable (no hooks).

type Variant = "card" | "thumb" | "detail" | "hero";

type BookCoverProps = {
  title: string;
  label?: string | null; // category or department shown at the top
  author?: string | null;
  variant?: Variant;
  className?: string;
};

const THEMES = ["bookcv-1", "bookcv-2", "bookcv-3", "bookcv-4", "bookcv-5", "bookcv-6"];

function hashOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

const SIZES: Record<Variant, { pad: string; cat: string; title: string; author: string; rule: string }> = {
  hero:   { pad: "p-4",   cat: "text-[9px]",    title: "text-base",     author: "text-[10px]", rule: "mt-2.5 w-7" },
  card:   { pad: "p-[22px]", cat: "text-[10px]", title: "text-[21px]",  author: "text-[12px]", rule: "mt-3.5 w-8" },
  thumb:  { pad: "p-3",   cat: "text-[8px]",    title: "text-[13px]",   author: "text-[10px]", rule: "mt-2 w-5" },
  detail: { pad: "p-7",   cat: "text-[11px]",   title: "text-[28px]",   author: "text-[13px]", rule: "mt-4 w-10" },
};

export default function BookCover({
  title,
  label,
  author,
  variant = "card",
  className = "",
}: BookCoverProps) {
  const h = hashOf(title || "Untitled");
  const theme = THEMES[h % THEMES.length];
  const decoration = h % 2 === 0 ? "dots" : "arc";
  const s = SIZES[variant];

  return (
    <div
      className={`book-cover-surface ${theme} relative flex h-full w-full flex-col justify-between text-white ${s.pad} ${className}`}
    >
      {/* decorative layer */}
      {decoration === "dots" ? (
        <span className="cover-dots" aria-hidden />
      ) : (
        <>
          <span className="cover-arc" aria-hidden />
          <span className="cover-arc" style={{ height: "80%", bottom: "-30%" }} aria-hidden />
        </>
      )}

      {/* top: category */}
      {label && (
        <span className={`relative z-[3] font-bold uppercase tracking-[0.16em] text-white/85 ${s.cat}`}>
          {label}
        </span>
      )}

      {/* bottom: title + author */}
      <div className="relative z-[3]">
        <div className={`serif font-medium leading-[1.12] ${s.title}`}>{title}</div>
        <div className={`h-[2px] bg-white/60 ${s.rule}`} />
        {author && <div className={`mt-2 font-medium text-white/80 ${s.author}`}>{author}</div>}
      </div>
    </div>
  );
}
