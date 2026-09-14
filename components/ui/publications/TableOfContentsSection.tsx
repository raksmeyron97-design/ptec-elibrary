import type { PublicationTocEntry } from "@/lib/publications";

/**
 * A short page locator: a number, a roman numeral, or a range ("776", "iv",
 * "12–15"). Only these get the printed-front-matter treatment — a dotted
 * leader ruling across to a right-aligned figure.
 *
 * The field is free text, and staff use it for whatever the source prints
 * beside a heading. One record here carries "Common Elements of Laboratory
 * Design and Renovation" in it, which the leader layout rendered as an
 * unwrappable `shrink-0` run that pushed clean off the right edge of a phone.
 * A long value is a subtitle, not a locator, so it is set under the title
 * where it can wrap.
 */
function isPageLocator(page: string): boolean {
  return /^[0-9ivxlcdm]+(\s*[–—-]\s*[0-9ivxlcdm]+)?$/i.test(page.trim()) && page.trim().length <= 12;
}

/**
 * The article's own table of contents: numbered rows with the printed page,
 * joined by a dotted leader from `sm` (on a phone the leader squeezed the
 * heading into a narrow column, so the page number simply sits at the end).
 * A plain list on the page's surface, not a card.
 */
export default function TableOfContentsSection({ entries }: { entries: PublicationTocEntry[] }) {
  return (
    <ol className="divide-y divide-divider/70">
      {entries.map((entry, i) => {
        const page = entry.page?.trim() || "";
        const asLocator = page !== "" && isPageLocator(page);
        return (
          <li
            key={i}
            className="flex items-baseline gap-3 py-2.5"
          >
            <span className="w-6 shrink-0 text-[13px] font-semibold tabular-nums text-text-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-6 text-text-body">{entry.title}</p>
              {entry.title_km && (
                <p lang="km" className="font-khmer-serif text-[13.5px] leading-7 text-text-muted">{entry.title_km}</p>
              )}
              {page !== "" && !asLocator && (
                <p className="mt-0.5 text-[13px] leading-6 text-text-muted">{page}</p>
              )}
            </div>
            {asLocator && (
              <>
                <span aria-hidden className="hidden min-w-4 max-w-48 flex-1 self-center border-b border-dotted border-border-strong sm:block" />
                <span className="shrink-0 text-[13px] tabular-nums text-text-muted">{page}</span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
