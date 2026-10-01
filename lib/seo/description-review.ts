// lib/seo/description-review.ts
//
// The rules of the description review queue (SEO Phase 5.2). Pure, shared by
// the admin actions and their tests.

import { citationLocale } from "@/lib/seo/citation";
import { REVIEW_MARKER } from "@/lib/seo/intro-drafts";

export const DESCRIPTION_STATUSES = ["none", "draft", "approved"] as const;
export type DescriptionStatus = (typeof DESCRIPTION_STATUSES)[number];

/** Longest draft the queue stores — the field is a description, not an essay. */
export const DESCRIPTION_DRAFT_MAX = 2000;

export function cleanDraft(value: string | null | undefined): string | null {
  const text = value?.replace(/\r\n/g, "\n").trim() ?? "";
  return text ? text.slice(0, DESCRIPTION_DRAFT_MAX) : null;
}

/**
 * Which draft becomes the book's description on approval. `books` has ONE
 * description column, and it is written in the book's own language — the
 * same rule that decides which page carries a work's Scholar tags
 * (lib/seo/citation.ts citationLocale). The other language's draft stays
 * stored for the day a second column exists. Null when the book's language
 * has no draft: approving the wrong language would replace a Khmer book's
 * description with English.
 */
export function draftToPublish(
  book: { language?: string | null; title?: string | null },
  drafts: { en?: string | null; km?: string | null },
): { text: string; locale: "en" | "km" } | null {
  const locale = citationLocale(book.language, book.title);
  const text = cleanDraft(locale === "km" ? drafts.km : drafts.en);
  return text ? { text, locale } : null;
}

/**
 * A draft still marked for review — `TODO(km-review)` on a rule-built Khmer
 * draft (lib/seo/description-draft.ts), `needs_review`, `TBD` — is not ready
 * to publish. Approval refuses it until the reviewer has removed the marker,
 * which is the act of saying "I checked this".
 */
export function carriesReviewMarker(text: string): boolean {
  return REVIEW_MARKER.test(text);
}
