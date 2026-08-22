import type { DateParts } from "@/lib/posts/event-status";

/**
 * The date block — the recurring signature of the News & Events surfaces.
 *
 * Cambodian institutional notices lead with the date, not with a headline, and
 * they set it in Khmer numerals (០១ សីហា ២០២៦). Every post here is a dated
 * record of something the college did: a cohort's closing ceremony, a
 * partnership meeting, a notice. So the date gets the weight it actually
 * carries in this world, instead of the 12px muted line it used to be at the
 * bottom of a card.
 *
 * The gold hairline under the day is the one piece of ornament, and it is the
 * same rule that runs under the masthead and across the featured plate — one
 * structural device, used consistently, rather than a different flourish per
 * component.
 *
 * `tabular-nums` keeps a column of these optically aligned; Khmer numerals
 * carry no tabular figures, which is exactly why the day sits on its own line
 * with the rule beneath rather than inline with the month.
 */
export default function DateBlock({
  parts,
  tone = "ink",
  size = "md",
}: {
  parts: DateParts;
  /** `ink` on light surfaces, `light` on the navy plate. */
  tone?: "ink" | "light";
  size?: "sm" | "md";
}) {
  const dayClass = size === "sm" ? "text-[22px]" : "text-[28px]";
  const metaClass = size === "sm" ? "text-[10px]" : "text-[11px]";

  const dayColor = tone === "light" ? "text-white" : "text-text-heading";
  const metaColor = tone === "light" ? "text-white/80" : "text-text-muted";

  return (
    <div className="flex flex-none flex-col items-center text-center leading-none">
      <span
        className={`font-khmer-serif font-bold tabular-nums ${dayClass} ${dayColor}`}
      >
        {parts.day}
      </span>
      <span
        aria-hidden="true"
        className="my-1.5 h-px w-6 bg-accent"
      />
      <span
        className={`font-sans font-semibold uppercase tracking-[0.14em] ${metaClass} ${metaColor}`}
      >
        {parts.month}
      </span>
      <span
        className={`font-sans tabular-nums ${metaClass} ${metaColor} mt-0.5`}
      >
        {parts.year}
      </span>
    </div>
  );
}
