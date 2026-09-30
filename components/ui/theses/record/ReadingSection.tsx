import type { ReactNode } from "react";
import { ANCHOR_OFFSET, SECTION_HEADING } from "./styles";

/**
 * One section of the reading card: an anchor target with its own h2, a count
 * where the section is a list, and a hairline between it and the next.
 * A section whose child draws its own heading (the abstract, with its
 * language switch and reading controls) passes `labelledBy` instead.
 */
export default function ReadingSection({
  id,
  title,
  count,
  labelledBy,
  children,
}: {
  id: string;
  title?: string;
  count?: number;
  labelledBy?: string;
  children: ReactNode;
}) {
  const headingId = labelledBy ?? `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={`${ANCHOR_OFFSET} p-5 sm:p-7`}>
      {title && (
        <h2 id={headingId} className={SECTION_HEADING}>
          {title}
          {count != null && (
            <span className="ml-2 font-sans text-[15px] font-medium tabular-nums tracking-normal text-text-muted">{count}</span>
          )}
        </h2>
      )}
      {children}
    </section>
  );
}
