import type { PublicationTocEntry } from "@/lib/publications";

/**
 * Book-style table of contents with dotted leaders and page numbers,
 * like the front matter of a printed journal issue.
 */
export default function TableOfContentsSection({ entries }: { entries: PublicationTocEntry[] }) {
  return (
    <ol className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      {entries.map((entry, i) => (
        <li
          key={i}
          className="flex items-baseline gap-3 border-b border-divider/60 px-4 py-3 last:border-0 sm:px-5"
        >
          <span className="w-7 shrink-0 font-mono text-[12px] font-semibold tabular-nums text-brand">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-medium leading-6 text-text-body">{entry.title}</p>
            {entry.title_km && (
              <p className="font-khmer-serif text-[13px] leading-6 text-text-muted">{entry.title_km}</p>
            )}
          </div>
          {entry.page && (
            <>
              <span aria-hidden className="min-w-4 flex-1 self-center border-b border-dotted border-divider" />
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-muted">{entry.page}</span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
