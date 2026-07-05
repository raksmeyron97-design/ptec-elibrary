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
    <article className="max-w-[70ch]">
      {words > 0 && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
        </header>
      )}

      <section aria-labelledby="abstract-heading">
        <h2 id="abstract-heading" className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
          {heading}
        </h2>
        <p className="mt-3 font-sans text-[16px] leading-[1.8] text-text-body sm:text-[17px]">
          {abstract || "No abstract provided."}
        </p>

        {abstractSecondary && (
          <p className="mt-4 font-khmer-serif text-[16px] leading-[1.8] text-text-body sm:text-[17px]">
            {abstractSecondary}
          </p>
        )}

        {coverUrl && (
          <figure className="mt-5 overflow-hidden rounded-xl border border-divider">
            <Image
              src={coverUrl}
              alt={coverAlt ?? "Graphical abstract"}
              width={480}
              height={360}
              className="h-auto w-full object-cover"
            />
          </figure>
        )}
      </section>

      {keywords.length > 0 && (
        <section aria-labelledby="abstract-keywords-heading" className="mt-7 border-t border-divider pt-5">
          <h3 id="abstract-keywords-heading" className="sr-only">Keywords</h3>
          <KeywordList keywords={keywords} basePath={basePath} />
        </section>
      )}
    </article>
  );
}
