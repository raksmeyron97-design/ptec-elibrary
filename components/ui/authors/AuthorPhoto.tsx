"use client";

import { useState } from "react";

/**
 * Author portrait with an initials fallback.
 *
 * A Client Component only because of `onError`: an author photo is a URL in a
 * database row pointing at object storage, and storage rot is not hypothetical
 * here — the August 2026 audit found three files missing from their bucket. A
 * server-rendered <img> for a dead URL leaves the browser's broken-image glyph
 * on an academic's profile. This falls back to their initials instead, which
 * is what the page renders for the (many) authors who have no photo at all —
 * so a dead link and an absent one look the same, and both look deliberate.
 *
 * Deliberately NOT next/image: the fallback needs the load failure, and a
 * portrait at a fixed handful of sizes is not what the optimizer earns its
 * keep on.
 */
export default function AuthorPhoto({
  url,
  name,
  size = 128,
  className = "",
}: {
  url: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!url && !failed;

  // Grapheme-safe first letters: [...p][0] rather than p[0], so a Khmer or
  // accented name does not get half a codepoint.
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div
      style={{ width: size, height: size }}
      className={`shrink-0 overflow-hidden rounded-2xl border border-divider bg-paper ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          style={{ fontSize: Math.round(size * 0.34) }}
          className="flex h-full w-full items-center justify-center bg-brand/8 font-bold tracking-tight text-brand"
        >
          {initials}
        </div>
      )}
    </div>
  );
}
