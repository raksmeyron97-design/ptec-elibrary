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
//
// A cover that is still downloading fades in over 200 ms when it lands
// (`.cover-fade`, app/globals.css) instead of popping in row by row. Two
// exceptions, both deliberate: a `priority` cover (above the fold — it is the
// thing being waited for, so it paints the moment it can), and a cover the
// server-rendered page was ALREADY painting when this hydrated (hiding it
// then would make it blink out on the slow connections this is for). So the
// fade is armed before the first paint, and only for an image that has
// decoded nothing yet.

import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
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

/** A new URL is a new cover, so the attempt starts over — by REMOUNTING on
 *  the url (React's own way to reset state), not by resetting `failed` and
 *  `loaded` by hand during render. */
export default function SmartBookCover(props: SmartBookCoverProps) {
  return <Cover key={props.coverUrl ?? ""} {...props} />;
}

function Cover({
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
  // Not an effect: an effect resetting these would run AFTER next/image has
  // reported a cached cover as loaded, marking it unloaded again — which left
  // the pulsing placeholder animating underneath every cached cover, forever.
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const showImage = isSafeCoverUrl(coverUrl) && !failed;
  const fadeRef = useRef<HTMLDivElement>(null);

  // Before first paint: an image that has decoded nothing yet starts
  // transparent. The attribute is DOM-only (React never renders it), so it
  // cannot disagree with the server's HTML.
  useLayoutEffect(() => {
    const box = fadeRef.current;
    const img = box?.querySelector("img");
    if (!box || !img || priority) return;
    if (!img.complete && img.naturalWidth === 0) box.dataset.fade = "pending";
  }, [showImage, coverUrl, priority]);

  const reveal = () => {
    setLoaded(true);
    if (fadeRef.current) delete fadeRef.current.dataset.fade;
  };

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
          <div ref={fadeRef} className="cover-fade absolute inset-0">
            <Image
              src={coverUrl}
              alt={alt}
              fill
              sizes={sizes}
              priority={priority}
              unoptimized={unoptimized}
              className={`object-cover ${imgClassName}`}
              onLoad={reveal}
              onError={() => setFailed(true)}
            />
          </div>
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
