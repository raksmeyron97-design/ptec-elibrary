import { useTranslations } from "next-intl";
import type { ContentsEntry } from "@/lib/theses/contents";

const KHMER_RE = /[ក-៿]/u;

/**
 * The thesis's own table of contents (0160 `table_of_contents`), as its
 * librarian confirmed it: chapters, and their sections indented beneath them.
 *
 * Page numbers are the ones PRINTED in the thesis — a reader holding the copy,
 * or reading the PDF, sees the same numbers — so they are labelled as such
 * and are not links: a printed page is not a PDF page index, and a link that
 * opened the reader at the wrong page would be worse than none. Server-safe.
 */
export default function ContentsList({ entries }: { entries: ContentsEntry[] }) {
  const t = useTranslations("thesisDetail");
  return (
    <>
      <ol className="mt-4">
        {entries.map((entry, i) => (
          <li
            key={i}
            className={`grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-dashed border-divider py-2.5 last:border-b-0 ${
              entry.level === 2 ? "pl-6" : ""
            }`}
          >
            <span className="text-[12px] font-semibold tabular-nums text-text-muted">{entry.number ?? ""}</span>
            <span
              lang={KHMER_RE.test(entry.label) ? "km" : undefined}
              className={
                entry.level === 1
                  ? "min-w-0 break-words text-[15px] font-semibold leading-[1.5] text-text-heading [&:lang(km)]:font-kh"
                  : "min-w-0 break-words text-[14.5px] leading-[1.6] text-text-body [&:lang(km)]:font-kh"
              }
            >
              {entry.label}
            </span>
            <span className="text-[13px] tabular-nums text-text-muted">
              {entry.page ? t("contentsPage", { page: entry.page }) : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12.5px] leading-[18px] text-text-muted">{t("contentsPrinted")}</p>
    </>
  );
}
