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
          // The slot, not the viewport (SEO Phase 6, F15). On a phone the
          // book page caps the cover at 220px (max-w-[220px] below `sm`);
          // "100vw" there made a 412px phone at DPR 1.75 fetch the 828w file
          // for a 220px box — 56 KB where ~20 KB paints the same pixels, on
          // the image that IS the page's LCP. From `sm` to `lg` the cover spans
          // the card (the viewport less the page and card padding), and from
          // `lg` it sits in a 300px column.
          //
          // `calc(100vw - 6rem)`, never a bare `100vw`: next/image drops every
          // srcset width below deviceSizes[0] (640) when `sizes` holds a bare
          // `NNvw` ANYWHERE, so a bare one would take the phone's 448w file
          // away again. Pinned by pdf-cover-sizes.test.ts.
          sizes="(max-width: 639px) 220px, (max-width: 1023px) calc(100vw - 6rem), 300px"
          imgClassName="rounded-2xl"
        />
      </div>
    </div>
  );
}
