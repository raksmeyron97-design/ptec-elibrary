"use client";
// components/ui/books/SmartBookCover.tsx
//
// The single cover-resolution component used everywhere a book cover renders:
//
//   1. valid cover URL (http/https or app-relative) → <Image>
//   2. URL missing, unsafe, or failed to load       → <GeneratedBookCover>
//
// A failed URL swaps to the generated cover once (no retry loop, no broken
// image icon) and the failure state resets if the URL prop changes. The
// wrapper fills its positioned parent, so switching to the fallback causes no
// layout shift.

import Image from "next/image";
import { useEffect, useState } from "react";
import GeneratedBookCover, {
  type GeneratedCoverVariant,
} from "@/components/ui/books/GeneratedBookCover";

type SmartBookCoverProps = {
  coverUrl?: string | null;
  title: string;
  author?: string | null;
  category?: string | null;
  callNumber?: string | null;
  /** Stable identity for the generated design (slug or id). Defaults to title. */
  seed?: string | null;
  variant?: GeneratedCoverVariant;
  /**
   * Alt text for the real cover image. Default "" — every current call site
   * repeats the title as visible text next to the cover. Pass a meaningful
   * alt only where the cover is the sole representation of the book.
   */
  alt?: string;
  sizes?: string;
  priority?: boolean;
  /** Catalog covers are arbitrary external URLs — skip the optimizer for those. */
  unoptimized?: boolean;
  /** Extra classes on the <Image> (e.g. group-hover scale). */
  imgClassName?: string;
  className?: string;
};

/** Only http(s) or app-relative URLs may reach <Image> — never data:/javascript:. */
function isSafeCoverUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const u = url.trim();
  return /^https?:\/\//i.test(u) || (u.startsWith("/") && !u.startsWith("//"));
}

export default function SmartBookCover({
  coverUrl,
  title,
  author,
  category,
  callNumber,
  seed,
  variant = "card",
  alt = "",
  sizes,
  priority = false,
  unoptimized = false,
  imgClassName = "",
  className = "",
}: SmartBookCoverProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // A new URL deserves a fresh attempt; a re-render of the same URL does not.
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [coverUrl]);

  const showImage = isSafeCoverUrl(coverUrl) && !failed;

  return (
    <div className={`relative h-full w-full ${className}`}>
      {showImage ? (
        <>
          {!loaded && (
            <div
              aria-hidden
              className="absolute inset-0 animate-pulse bg-paper motion-reduce:animate-none"
            />
          )}
          <Image
            src={coverUrl}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            unoptimized={unoptimized}
            className={`object-cover ${imgClassName}`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <GeneratedBookCover
          title={title}
          author={author}
          category={category}
          callNumber={callNumber}
          seed={seed}
          variant={variant}
          className={imgClassName}
        />
      )}
    </div>
  );
}
