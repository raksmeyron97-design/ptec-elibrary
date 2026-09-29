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
export default function ThesisContents({ entries }: { entries: ContentsEntry[] }) {
  const t = useTranslations("thesisDetail");
  return (
    <>
      <ol className="mt-4 divide-y divide-divider">
        {entries.map((entry, i) => (
          <li
            key={i}
            className={`grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-3 py-2.5 ${
              entry.level === 2 ? "pl-6" : ""
            }`}
          >
            <span className="text-[12px] font-semibold tabular-nums text-text-muted">{entry.number ?? ""}</span>
            <span
              lang={KHMER_RE.test(entry.label) ? "km" : undefined}
              className={
                entry.level === 1
                  ? "min-w-0 break-words text-[15px] font-semibold leading-[1.5] text-text-heading"
                  : "min-w-0 break-words text-[14px] leading-[1.6] text-text-body"
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
      <p className="mt-3 text-[12px] text-text-muted">{t("contentsPrinted")}</p>
    </>
  );
}
