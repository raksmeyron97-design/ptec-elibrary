// components/ui/home/HeroTrustPoints.tsx
//
// The three facts that decide whether a stranger stays: it is free, it needs no
// account, and it is in their language.
//
// Used in two places, and the second one is not decoration. Once the homepage
// title moved to the mission line, cold discovery traffic ("free ebooks
// Cambodia") lands on /books instead of / — on a grid, having never been told
// the library is open to them. So /books renders these too, in the `light`
// tone, directly under its heading.
//
// They used to be reachable only inside the FAQ accordion at section 8 —
// collapsed, below the fold, on a page whose headline addressed trainee
// teachers. Someone who had never heard of PTEC had no way to learn any of it
// without scrolling past nine sections. They now sit directly under the search
// box, in the first viewport, and are the answer to "can I use this?".
//
// Not a stats row: nothing here is a number, and it is deliberately kept apart
// from <HeroStatStrip> so no label can be misread as belonging to a figure.
import { Check } from "lucide-react";

/** `dark` sits on the hero ink; `light` sits on a paper/surface background. */
export type TrustPointsTone = "dark" | "light";

const TONE: Record<TrustPointsTone, { text: string; plate: string }> = {
  dark: { text: "text-blue-50/90", plate: "bg-gold-400/20 text-gold-300" },
  light: { text: "text-text-body", plate: "bg-brand/10 text-brand" },
};

export default function HeroTrustPoints({
  points,
  tone = "dark",
  className = "mt-3.5",
}: {
  points: readonly string[];
  tone?: TrustPointsTone;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <ul
      data-testid="hero-trust-points"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}
    >
      {points.map((point) => (
        <li key={point} className={`flex items-center gap-2 text-[13px] font-semibold ${t.text}`}>
          <span
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${t.plate}`}
            aria-hidden
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          {point}
        </li>
      ))}
    </ul>
  );
}
