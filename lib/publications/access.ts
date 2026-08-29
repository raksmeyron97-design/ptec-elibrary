// lib/publications/access.ts
//
// One decision, one place: may this reader be handed the PDF bytes?
//
// The page and /api/publications/[slug]/file used to answer that question
// separately — the page decided whether to draw a Download button, the route
// decided whether to stream. Two answers to one question is how a hidden
// button becomes the only thing standing between a visitor and a file they
// were not meant to have. This module is pure (no imports from server-only
// modules) so BOTH callers can use it, and so it can be unit-tested against
// the matrix rather than by clicking.
//
// Two independent gates, both of which must pass:
//
//   allow_download            LIBRARY POLICY. A librarian's switch (0125).
//                             "We host it, we choose not to hand out the file."
//   redistributable rights    LAW. A verified redistributable licence, or the
//                             work being PTEC's own output (0092 +
//                             isFreelyAccessible). "We are not allowed to."
//
// They are deliberately not collapsed into one column: the reasons differ, the
// people who set them differ, and the message a reader should see differs.

import { isFreelyAccessible } from "@/lib/seo/publication-seo";

/** The fields of a publication row this decision actually reads. */
export interface DownloadAccessInput {
  slug: string;
  title: string;
  publisher: string | null;
  license: string | null;
  /** Column from 0125. Undefined on a row read before the migration → treated as allowed. */
  allow_download?: boolean | null;
  /** Column from 0125. The librarian's own words, shown to the reader. */
  download_disabled_reason?: string | null;
  /** Column from 0092. An explicit admin override of the licence heuristic. */
  fulltext_redistributable?: boolean | null;
  /** Whether a file exists at all. */
  pdf_url?: string | null;
}

export type DownloadDenialReason =
  /** No file is attached — nothing to download or read. */
  | "no-file"
  /** The library has switched downloads off for this record. */
  | "policy"
  /** No verified right to redistribute the full text (citation-only record). */
  | "rights";

export interface DownloadAccess {
  /** May the reader download the file? */
  canDownload: boolean;
  /** May the reader open it in the in-page viewer? */
  canReadOnline: boolean;
  /** Why not, when canDownload is false. Null when it is true. */
  reason: DownloadDenialReason | null;
  /** The librarian's custom explanation, when one was recorded and applies. */
  message: string | null;
}

/**
 * The licence/rights half of the decision. Delegates to the SAME predicate the
 * SEO builder uses to decide whether to claim `isAccessibleForFree` — so a
 * record can never advertise itself as open access in structured data while
 * refusing the download, or vice versa. isFreelyAccessible is pure and
 * browser-safe, which is why it can be reached from here.
 */
function isRedistributable(pub: DownloadAccessInput): boolean {
  if (pub.fulltext_redistributable === true) return true;
  return isFreelyAccessible({
    slug: pub.slug,
    title: pub.title,
    publisher: pub.publisher,
    license: pub.license,
  });
}

/**
 * Resolve what a reader may do with this publication's full text.
 *
 * Online reading survives every denial that is not "there is no file": a
 * citation-only record and a read-online-only record are both still readable
 * in the viewer, which is the whole point of distinguishing them from an
 * unavailable one.
 */
export function resolveDownloadAccess(pub: DownloadAccessInput): DownloadAccess {
  const hasFile = !!pub.pdf_url;
  if (!hasFile) {
    return { canDownload: false, canReadOnline: false, reason: "no-file", message: null };
  }

  // Library policy is checked first: when a librarian has switched downloads
  // off, that is the reason the reader is shown, even if the rights gate would
  // also have refused. It is the more specific, more actionable statement, and
  // it is the one a librarian can explain.
  if (pub.allow_download === false) {
    return {
      canDownload: false,
      canReadOnline: true,
      reason: "policy",
      message: pub.download_disabled_reason?.trim() || null,
    };
  }

  if (!isRedistributable(pub)) {
    return { canDownload: false, canReadOnline: true, reason: "rights", message: null };
  }

  return { canDownload: true, canReadOnline: true, reason: null, message: null };
}
