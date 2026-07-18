"use client";

import SmartBookCover from "@/components/ui/books/SmartBookCover";

type PDFCoverProps = {
  title: string;
  coverUrl?: string | null;
  fallbackColor?: string;
  label?: string | null;
  author?: string | null;
  pdfUrl?: string | null;
};

export default function PDFCover({ title, coverUrl, label, author }: PDFCoverProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-[0_24px_60px_-18px_rgba(11,42,48,0.28)]">
      <div className="relative aspect-[3/4] w-full">
        <SmartBookCover
          coverUrl={coverUrl}
          title={title}
          author={author}
          category={label}
          alt={author ? `Book cover: ${title} by ${author}` : `Book cover: ${title}`}
          variant="detail"
          priority
          sizes="(max-width: 768px) 100vw, 300px"
          imgClassName="rounded-2xl"
        />
      </div>
    </div>
  );
}
