/**
 * Section heading for a scholarly detail page.
 *
 * Replaces the 12px uppercase grey caption every section on the publication
 * page used to carry. That treatment made "Abstract", "References" and "About
 * the Authors" read as form-field labels rather than document sections, so a
 * 4,800px article had no scannable structure — the semantic <h2> level and the
 * visual weight disagreed. Here they agree: one size, one weight, a brand rule
 * to anchor the left edge, and an optional count that stays out of the
 * accessible name's way.
 *
 * `aside` is for a control that belongs to the section (a reader toolbar, an
 * "open in new tab" link) and should sit on the heading's baseline.
 */
export default function SectionHeading({
  id,
  children,
  count,
  aside,
  className = "",
}: {
  /** Wired to the section's aria-labelledby. */
  id?: string;
  children: React.ReactNode;
  /** Rendered as a chip after the title; omit for uncounted sections. */
  count?: number | string;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${className}`}>
      <h2
        id={id}
        className="flex min-w-0 items-center gap-2.5 text-[19px] font-bold leading-tight tracking-[-0.01em] text-text-heading sm:text-[21px]"
      >
        <span aria-hidden="true" className="h-[1.1em] w-[3px] shrink-0 rounded-full bg-brand" />
        <span className="min-w-0">{children}</span>
        {count !== undefined && (
          <>
            {/* An explicit space. Adjacent inline elements with no whitespace
                between them concatenate in the accessible name, so the chip
                turned this heading into "References2". */}
            {" "}
            <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-brand">
              {count}
            </span>
          </>
        )}
      </h2>
      {aside}
    </div>
  );
}
