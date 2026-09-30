"use client";

import { useCallback, useState } from "react";
import GeneratedBookCover from "@/components/ui/books/GeneratedBookCover";

/**
 * A record's cover on the Overview, falling back to the library's own
 * generated cover when there is no usable image.
 *
 * Only an absolute http(s) URL is tried. `cover_url` on older rows can hold a
 * bare storage key, which is not an address a browser can load — trying it
 * would render a broken-image glyph on the most visible panel in the admin.
 * Decorative: every caller prints the title as real text beside the cover.
 */
export default function DashCover({
  coverUrl,
  title,
  seed,
  variant,
  category,
}: {
  coverUrl: string | null;
  title: string;
  seed: string;
  variant: "thumb" | "shelf";
  /** Picks the generated cover's subject palette, as on the public site. */
  category?: string | null;
}) {
  // Which URL failed, rather than a boolean: a new `coverUrl` is then untried
  // by construction, with no effect to reset anything.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const broken = failedUrl !== null && failedUrl === coverUrl;

  // The error event can fire before hydration attaches onError; a ref
  // callback catches an image that had already failed by mount time.
  const imgRef = useCallback(
    (node: HTMLImageElement | null) => {
      if (node && node.complete && node.naturalWidth === 0) setFailedUrl(coverUrl);
    },
    [coverUrl],
  );

  const usable = !!coverUrl && /^https?:\/\//i.test(coverUrl) && !broken;

  return (
    <div className={`dash-cover dash-cover--${variant}`} aria-hidden="true">
      {usable ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote covers on the storage CDN; the admin never optimises them
        <img
          ref={imgRef}
          src={coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(coverUrl)}
        />
      ) : (
        <GeneratedBookCover
          title={title}
          seed={seed}
          category={category}
          variant={variant === "thumb" ? "thumbnail" : "card"}
        />
      )}
    </div>
  );
}
