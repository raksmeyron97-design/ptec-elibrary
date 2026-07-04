import Link from "next/link";
import { Tag } from "lucide-react";

export default function KeywordList({ keywords }: { keywords: string[] }) {
  if (keywords.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
        <Tag className="h-3.5 w-3.5" />
        Keywords
      </h3>
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw) => (
          <Link
            key={kw}
            href={`/theses?keyword=${encodeURIComponent(kw)}`}
            className="rounded-full border border-divider bg-paper px-3 py-1 text-[12.5px] font-medium text-text-body transition-all duration-150 hover:border-brand/40 hover:bg-brand/5 hover:text-brand active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            {kw}
          </Link>
        ))}
      </div>
    </div>
  );
}
