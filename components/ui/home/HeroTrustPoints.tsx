// components/ui/home/HeroTrustPoints.tsx
//
// The three facts that decide whether a stranger stays: it is free, it needs no
// account, and it is in their language.
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

export default function HeroTrustPoints({ points }: { points: readonly string[] }) {
  return (
    <ul data-testid="hero-trust-points" className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
      {points.map((point) => (
        <li key={point} className="flex items-center gap-2 text-[13px] font-semibold text-blue-50/90">
          <span
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-gold-400/20 text-gold-300"
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
