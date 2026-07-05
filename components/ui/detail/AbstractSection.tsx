import Image from "next/image";
import { Clock, FileText } from "lucide-react";
import KeywordList from "@/components/ui/detail/KeywordList";

const WORDS_PER_MINUTE = 200;

export default function AbstractSection({
  abstract,
  abstractSecondary,
  keywords,
  basePath,
  coverUrl,
  coverAlt,
  heading = "Abstract",
}: {
  abstract: string;
  abstractSecondary?: string | null;
  keywords: string[];
  basePath: string;
  coverUrl?: string | null;
  coverAlt?: string;
  heading?: string;
}) {
  const words = abstract.trim() ? abstract.trim().split(/\s+/).filter(Boolean).length : 0;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0;

  return (
    <div className="max-w-[70ch]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{heading}</h2>
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

      {coverUrl && (
        <div className="relative float-none mb-5 w-full overflow-hidden rounded-xl border border-divider sm:float-left sm:mb-4 sm:mr-6 sm:w-[240px]">
          <Image
            src={coverUrl}
            alt={coverAlt ?? "Graphical abstract"}
            width={480}
            height={360}
            className="h-auto w-full object-cover"
          />
        </div>
      )}

      <p className="font-sans text-[16px] leading-[1.8] text-text-body sm:text-[17px]">
        {abstract || "No abstract provided."}
      </p>

      {abstractSecondary && (
        <p className="mt-4 clear-both font-khmer-serif text-[16px] leading-[1.8] text-text-body sm:text-[17px]">
          {abstractSecondary}
        </p>
      )}

      {keywords.length > 0 && (
        <div className="mt-7 clear-both border-t border-divider pt-5">
          <KeywordList keywords={keywords} basePath={basePath} />
        </div>
      )}
    </div>
  );
}
