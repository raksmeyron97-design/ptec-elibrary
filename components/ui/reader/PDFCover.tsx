"use client";

import { useState } from "react";
import Image from "next/image";
import BookCover from "@/components/ui/books/BookCover";

type PDFCoverProps = {
  title: string;
  coverUrl?: string | null;
  fallbackColor?: string;
  label?: string | null;
  author?: string | null;
  pdfUrl?: string | null;
};

export default function PDFCover({ title, coverUrl, label, author }: PDFCoverProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(coverUrl) && !imgError;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-[0_24px_60px_-18px_rgba(11,42,48,0.28)]">
      {showImage ? (
        <div className="relative aspect-[3/4] w-full">
          <Image
            src={coverUrl!}
            alt={`Cover of ${title}`}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 300px"
            className="rounded-2xl object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="aspect-[3/4] w-full">
          <BookCover title={title} label={label} author={author} variant="detail" />
        </div>
      )}
    </div>
  );
}
