"use client";
// components/admin/catalogs/AdminCoverThumb.tsx
//
// Cover cell for the admin catalog table. Unlike the public pages, admins
// SHOULD see cover problems: records without a cover show the generated
// fallback plus a "Generated" tag, and covers whose URL fails to load are
// flagged "Broken URL" so they can be fixed.

import { useCallback, useEffect, useState } from "react";
import GeneratedBookCover from "@/components/ui/books/GeneratedBookCover";

type AdminCoverThumbProps = {
  coverUrl: string | null;
  title: string;
  category: string | null;
  seed?: string | null;
};

export default function AdminCoverThumb({ coverUrl, title, category, seed }: AdminCoverThumbProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [coverUrl]);

  // The error event can fire before hydration attaches onError (SSR race) —
  // a ref callback catches images that already failed by mount time.
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setBroken(true);
  }, []);

  const hasUrl = !!coverUrl;
  const showImage = hasUrl && !broken;

  return (
    <div className="mx-auto w-10">
      <div className="relative h-14 w-10 overflow-hidden rounded shadow-sm">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={coverUrl}
            alt=""
            width={40}
            height={56}
            loading="lazy"
            className="h-14 w-10 object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <GeneratedBookCover
            title={title}
            category={category}
            seed={seed ?? title}
            variant="thumbnail"
          />
        )}
      </div>
      {broken ? (
        <span className="mt-1 block rounded bg-red-50 px-1 py-px text-center text-[9px] font-bold leading-tight text-red-600">
          Broken URL
        </span>
      ) : !hasUrl ? (
        <span className="mt-1 block rounded bg-paper px-1 py-px text-center text-[9px] font-semibold leading-tight text-text-muted">
          Generated
        </span>
      ) : null}
    </div>
  );
}
