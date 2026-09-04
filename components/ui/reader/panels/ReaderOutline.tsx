"use client";

import { memo, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { FlatOutlineEntry } from "@/lib/reader/outline";

/* Table of contents: numbered top level, indented children, the current
   section marked (and scrolled into view when the panel opens). */
const ReaderOutline = memo(function ReaderOutline({
  entries,
  currentIndex,
  onSelect,
  fmt,
}: {
  entries: FlatOutlineEntry[];
  currentIndex: number;
  onSelect: (entry: FlatOutlineEntry) => void;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
    // once, on mount — following the reader around while they scroll would
    // yank the list out from under a pointer heading for another entry
  }, []);

  if (!entries.length) {
    return <p className="reader-muted p-3 text-[13px] leading-6">{t("noOutline")}</p>;
  }
  return (
    <nav aria-label={t("tableOfContents")}>
      <p className="reader-menu-heading">{t("tableOfContents")}</p>
      <ul className="space-y-0.5">
        {entries.map((entry, i) => {
          const current = i === currentIndex;
          return (
            <li key={entry.id}>
              <button
                ref={current ? currentRef : undefined}
                type="button"
                onClick={() => onSelect(entry)}
                aria-current={current ? "true" : undefined}
                className="reader-row items-baseline"
                style={{ paddingLeft: `${0.625 + entry.depth * 0.875}rem` }}
                title={entry.title}
              >
                {entry.number ? (
                  <span className="reader-accent w-6 shrink-0 text-[11px] font-bold tabular-nums">{fmt(entry.number)}</span>
                ) : (
                  <span className="reader-faint w-3 shrink-0 text-[11px]" aria-hidden>·</span>
                )}
                <span className={`min-w-0 flex-1 leading-5 ${entry.depth === 0 ? "font-semibold" : ""}`}>
                  <span className="line-clamp-2">{entry.title}</span>
                </span>
                {entry.page !== null && (
                  <span className="reader-faint shrink-0 text-[11px] tabular-nums">{fmt(entry.page)}</span>
                )}
                {current && <span className="sr-only">({t("currentSection")})</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});

export default ReaderOutline;
