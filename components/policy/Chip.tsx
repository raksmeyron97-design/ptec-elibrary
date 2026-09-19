// components/policy/Chip.tsx
//
// A small labelled pill: icon + text, never colour alone.
//
// WCAG 1.4.1 is the whole design here. The visibility column of the privacy
// table encodes four states, and a coloured dot would put the difference
// between "only you can see this" and "anyone on the internet can see this"
// into a channel that ~8% of male readers cannot reliably separate. So every
// chip carries three signals at once: a distinct icon SHAPE, the full text
// label, and the colour. Remove the colour and the chip still reads.
//
// Both themes come free: each tone is a `-soft`/`-line`/`-text` token triple
// that already resolves per theme, so no call site needs a `dark:` variant
// (lib/status-tokens.test.ts fails on one that adds it). The border is not
// decoration — on a dark surface the soft fill is a low-alpha overlay, and the
// border is what gives the pill its edge.
//
// Server component: it renders a span.

import { Globe, Lock, Server, Users, type LucideIcon } from "lucide-react";

export type ChipTone = "private" | "shared" | "public" | "steward" | "neutral";

const TONE: Record<ChipTone, string> = {
  // Private: the reassuring end of the scale, so the affirmative token.
  private: "bg-success-soft border-success-line text-success-text",
  shared: "bg-warning-soft border-warning-line text-warning-text",
  // Public is not an ERROR — nothing has gone wrong when a reader publishes a
  // review. It gets the danger token because it is the state a reader most
  // needs to notice before they type, which is what that token is for here.
  public: "bg-danger-soft border-danger-line text-danger-text",
  steward: "bg-info-soft border-info-line text-info-text",
  neutral: "bg-bg-app border-divider text-text-muted",
};

const ICON: Record<ChipTone, LucideIcon> = {
  private: Lock,
  shared: Users,
  public: Globe,
  steward: Server,
  neutral: Server,
};

export default function Chip({
  tone,
  label,
  km = false,
  className = "",
}: {
  tone: ChipTone;
  label: string;
  /** Khmer heading face for a Khmer label. */
  km?: boolean;
  className?: string;
}) {
  const Icon = ICON[tone];
  return (
    <span
      // `whitespace-nowrap`, NOT `.policy-wrap`. The wrap helper sets
      // `overflow-wrap: anywhere`, which long Khmer compounds need in a table
      // cell and which shreds an English label inside a pill — "Technical
      // steward" came out as three lines reading "Tech / nical / stewa rd".
      // A chip is one short label; it sizes its column rather than wrapping
      // inside it, and the table scrolls horizontally if it must.
      className={`policy-chip inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] font-medium leading-snug ${TONE[tone]} ${km ? "font-khmer-serif" : ""} ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      {label}
    </span>
  );
}
