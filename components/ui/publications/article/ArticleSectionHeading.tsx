/**
 * A section heading inside a journal article's body — Abstract, Full text,
 * Figures, References, About the authors.
 *
 * Deliberately quieter than the shared `SectionHeading` (which the About and
 * Search pages keep): no brand rule, no filled count pill. On an article the
 * sections are chapters of one document, and ten brand-ruled headings in a
 * column read as ten cards. The count is plain muted numerals after the name,
 * separated by a real space so the accessible name is "References 14", not
 * "References14".
 *
 * `aside` is for a control that belongs to the section (the abstract's reader
 * toolbar) and sits on the heading's baseline.
 */
export default function ArticleSectionHeading({
  id,
  children,
  count,
  aside,
  className = "",
}: {
  /** Wired to the section's aria-labelledby. */
  id?: string;
  children: React.ReactNode;
  count?: number;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-divider pb-3 ${className}`}>
      <h2
        id={id}
        // A step up from the 21/23 it shipped at: against 17–18 px body copy
        // the headings were barely a size apart from the text under them, so
        // ten sections read as one undifferentiated column.
        className="min-w-0 font-khmer-serif text-[22px] font-bold leading-[1.25] tracking-[-0.008em] text-text-heading [&:lang(km)]:leading-[1.5] [&:lang(km)]:tracking-normal sm:text-[26px]"
      >
        {children}
        {count !== undefined && (
          <>
            {" "}
            <span className="font-sans text-[15px] font-medium tabular-nums text-text-muted">{count}</span>
          </>
        )}
      </h2>
      {aside}
    </div>
  );
}
