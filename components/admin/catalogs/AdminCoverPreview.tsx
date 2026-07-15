"use client";
// components/admin/catalogs/AdminCoverPreview.tsx
//
// Side-by-side cover preview for the add/edit book forms: the external URL
// (with live broken-URL detection) next to the generated PTEC fallback that
// readers automatically see when no cover is set.

import { useCallback, useEffect, useState } from "react";
import GeneratedBookCover from "@/components/ui/books/GeneratedBookCover";

type AdminCoverPreviewProps = {
  coverUrl: string | null;
  title: string;
  author?: string | null;
  category?: string | null;
};

export default function AdminCoverPreview({ coverUrl, title, author, category }: AdminCoverPreviewProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [coverUrl]);

  // Catch images that already failed before hydration attached onError.
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setBroken(true);
  }, []);

  const url = coverUrl?.trim() || null;

  return (
    <div className="mt-2 flex flex-wrap items-start gap-4 rounded-xl border border-divider bg-paper/50 p-3">
      {url && (
        <figure className="w-[92px]">
          <div className="relative h-[128px] w-[92px] overflow-hidden rounded-lg border border-divider bg-bg-surface">
            {broken ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                </svg>
                <span className="text-[9px] font-bold leading-tight text-red-600">URL failed to load</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={url}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setBroken(true)}
              />
            )}
          </div>
          <figcaption className="mt-1 text-center text-[9px] font-semibold text-text-muted">
            {broken ? "Broken cover URL" : "Cover from URL"}
          </figcaption>
        </figure>
      )}

      <figure className="w-[92px]">
        <div className="relative h-[128px] w-[92px] overflow-hidden rounded-lg border border-divider">
          <GeneratedBookCover
            title={title || "Book title"}
            author={author}
            category={category}
            variant="card"
          />
        </div>
        <figcaption className="mt-1 text-center text-[9px] font-semibold text-text-muted">
          Generated fallback
        </figcaption>
      </figure>

      <p className="min-w-[160px] flex-1 text-[11px] leading-relaxed text-text-muted">
        {url && !broken
          ? "Readers see the cover image from the URL. If it ever fails to load, the generated PTEC cover on the right takes over automatically."
          : url && broken
            ? "This URL is not loading — readers currently see the generated PTEC cover instead. Replace or clear the URL."
            : "No cover URL set. Readers automatically see this generated PTEC cover, styled by the book's category. Add a URL any time to replace it."}
      </p>
    </div>
  );
}
