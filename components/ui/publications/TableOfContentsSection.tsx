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
 * Book-style table of contents with dotted leaders and page numbers,
 * like the front matter of a printed journal issue.
 */
export default function TableOfContentsSection({ entries }: { entries: PublicationTocEntry[] }) {
  return (
    <ol className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      {entries.map((entry, i) => {
        const page = entry.page?.trim() || "";
        const asLocator = page !== "" && isPageLocator(page);
        return (
          <li
            key={i}
            className="flex items-baseline gap-3 border-b border-divider/60 px-4 py-3 last:border-0 sm:px-5"
          >
            <span className="w-7 shrink-0 font-mono text-[12px] font-semibold tabular-nums text-brand">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-6 text-text-body">{entry.title}</p>
              {entry.title_km && (
                <p className="font-khmer-serif text-[13px] leading-6 text-text-muted">{entry.title_km}</p>
              )}
              {page !== "" && !asLocator && (
                <p className="mt-0.5 text-[13px] leading-6 text-text-muted">{page}</p>
              )}
            </div>
            {asLocator && (
              <>
                <span aria-hidden className="min-w-4 flex-1 self-center border-b border-dotted border-divider" />
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-muted">{page}</span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
