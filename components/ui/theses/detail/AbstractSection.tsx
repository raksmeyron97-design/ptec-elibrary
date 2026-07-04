import { Clock, FileText } from "lucide-react";
import KeywordList from "@/components/ui/theses/detail/KeywordList";

const WORDS_PER_MINUTE = 200;

export default function AbstractSection({ abstract, keywords }: { abstract: string; keywords: string[] }) {
  const words = abstract.trim() ? abstract.trim().split(/\s+/).filter(Boolean).length : 0;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0;

  return (
    <div className="max-w-[70ch]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">Abstract</h2>
        {words > 0 && (
          <div className="flex items-center gap-3 text-[12px] text-text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {readingMinutes} min read
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {words.toLocaleString()} words
            </span>
          </div>
        )}
      </div>

      <p className="font-sans text-[16px] leading-[1.8] text-text-body sm:text-[17px]">
        {abstract || "No abstract provided."}
      </p>

      {keywords.length > 0 && (
        <div className="mt-7 border-t border-divider pt-5">
          <KeywordList keywords={keywords} />
        </div>
      )}
    </div>
  );
}
