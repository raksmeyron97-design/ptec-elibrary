"use client";

// components/ui/home/RecentCover.tsx
// Cover image for the "Just added" cards, with a fallback that survives a dead
// URL — not just a missing one.
//
// A `cover_url` can be present in the database and still 404 at the origin
// (verified: one published book points at a storage-ptec.online file that no
// longer exists). Rendering <Image> on the strength of the column being
// non-null therefore paints a browser broken-image box. The generated cover
// is the same fallback used for books that never had an image, so a stale row
// degrades to a designed placeholder instead of a defect.
//
// The stale rows themselves are a data problem: scripts/check-file-health.ts
// sweeps every cover_url and surfaces the failures in /admin/data-quality.
// This component just makes the homepage resilient in the meantime.

import { useState } from "react";
import Image from "next/image";
import GeneratedBookCover from "@/components/ui/books/GeneratedBookCover";

export default function RecentCover({
  src,
  title,
  author,
  sizes,
}: {
  src: string | null;
  title: string;
  author: string | null;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <GeneratedBookCover title={title} author={author} variant="card" className="h-full w-full" />
    );
  }

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      onError={() => setFailed(true)}
      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
    />
  );
}
