"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, ImageOff } from "lucide-react";

const COVERS = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

/** Zima covers are full URLs; legacy R2 rows store a bare object key. */
function resolveCoverSrc(raw: string): string {
  return raw.startsWith("http") ? raw : `${COVERS}/${raw}`;
}

/**
 * Fixed-aspect, lazy-loaded cover thumbnail. Never causes layout shift
 * (the box is sized whether or not the image loads) and downgrades to a
 * clearly-broken placeholder when the image request fails — a live signal
 * on top of the out-of-band file_health check.
 */
export default function EbookCover({
  coverUrl,
  title,
  className = "h-14 w-10",
}: {
  coverUrl: string | null;
  title: string;
  className?: string;
}) {
  const t = useTranslations("adminEbooks.coverAlt");
  const [failed, setFailed] = useState(false);

  if (!coverUrl) {
    return (
      <div
        className={`${className} flex shrink-0 items-center justify-center rounded border border-dashed border-divider bg-paper text-text-muted`}
        role="img"
        aria-label={t("noCover", { title })}
      >
        <BookOpen className="h-4 w-4 opacity-50" aria-hidden="true" />
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className={`${className} flex shrink-0 items-center justify-center rounded border border-red-200 bg-red-50 text-red-500`}
        role="img"
        aria-label={t("brokenCover", { title })}
        title={t("failedToLoad")}
      >
        <ImageOff className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolveCoverSrc(coverUrl)}
      alt={`Cover of ${title}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${className} shrink-0 rounded object-cover shadow-sm`}
    />
  );
}
