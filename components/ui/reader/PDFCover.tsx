"use client";

import { useState } from "react";
import BookCover from "@/components/ui/books/BookCover";

type PDFCoverProps = {
  title: string;
  coverUrl?: string | null;
  fallbackColor?: string; // kept for backwards-compat (BookCover picks its own theme)
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
        <img
          src={coverUrl!}
          alt={`Cover of ${title}`}
          className="block w-full rounded-2xl object-cover"
          style={{ minHeight: "430px" }}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="aspect-[3/4] w-full">
          <BookCover title={title} label={label} author={author} variant="detail" />
        </div>
      )}
    </div>
  );
}
